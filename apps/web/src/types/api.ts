// API 相关类型定义

import type { StepType } from "./flow";

/**
 * SSE 流式事件的基础结构
 */
export interface StreamEvent {
  type: string;
  data: unknown;
}

/**
 * 具体的事件类型枚举 (与后端 events 对应)
 * 使用 StepType 联合类型统一 Traditional 和 Figma 流程的步骤
 */
export type StreamEventType = StepType | "done" | "error";

/**
 * 具体的事件载荷可以根据需要在此扩展，
 * 目前为了松耦合，我们在 api service 层使用 unknown，在业务 hook 层再去 cast 具体类型。
 */
