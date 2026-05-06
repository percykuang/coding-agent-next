/**
 * 通用重试执行器
 * 用于包装 LLM 调用，提供自动重试能力（带错误反馈）
 */

import { HumanMessage } from "@langchain/core/messages";

export interface RetryOptions {
  maxRetries?: number;
  onRetry?: (attempt: number, error: Error) => void;
  /** 自定义错误反馈消息生成器，默认使用通用提示 */
  formatErrorFeedback?: (error: Error) => string;
}

/** 可调用的模型接口 */
interface InvokableModel<T> {
  invoke: (messages: any[]) => Promise<T>;
}

const DEFAULT_MAX_RETRIES = 3;

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError")
  );
}

/** 默认的错误反馈消息生成器 */
const defaultErrorFeedback = (error: Error): string =>
  `⚠️ 上一次生成失败，错误信息：\n${error.message}\n\n请仔细检查并修正以下问题：\n1. 确保所有枚举字段只使用 Schema 定义的合法值\n2. 确保 JSON 格式正确，没有遗漏必填字段\n3. 确保代码语法正确\n\n请重新生成正确的输出：`;

/**
 * 带重试的 LLM 调用执行器
 *
 * 默认行为：重试时自动将错误信息反馈给 LLM，让它能够根据错误修正输出
 *
 * @param model 可调用的模型（需要有 invoke 方法）
 * @param messages 初始消息数组
 * @param options 重试配置
 * @returns 执行结果
 *
 * @example
 * const result = await withRetry(structuredModel, messages, {
 *   maxRetries: 3,
 *   onRetry: (attempt, error) => console.warn(`Retry ${attempt}:`, error.message)
 * });
 */
export async function withRetry<T>(
  model: InvokableModel<T>,
  messages: any[],
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    onRetry,
    formatErrorFeedback = defaultErrorFeedback,
  } = options;

  let lastError: Error | null = null;
  let currentMessages = [...messages];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await model.invoke(currentMessages);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        onRetry?.(attempt, lastError);
        // 追加错误反馈消息用于下次重试
        currentMessages = [...messages, new HumanMessage(formatErrorFeedback(lastError))];
      }
    }
  }

  throw lastError;
}
