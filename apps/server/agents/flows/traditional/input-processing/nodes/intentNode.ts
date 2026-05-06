import { IntentSchema } from "../schemas/intentSchema.js";
import { IntentPrompts } from "../prompts/intentPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import {
  coerceNullableStringArray,
  coerceString,
  coerceStringArray,
  parseLlmOutputObject,
} from "../../../../utils/providerOutputRecovery.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

function recoverIntentFromError(error: unknown) {
  const parsed = parseLlmOutputObject(error);
  if (!parsed) {
    return null;
  }

  try {
    const normalized = {
      ...parsed,
      product:
        parsed.product && typeof parsed.product === "object"
          ? {
              ...parsed.product,
              name: coerceString((parsed.product as Record<string, unknown>).name, "未命名产品"),
              description: coerceString(
                (parsed.product as Record<string, unknown>).description,
                "产品描述待补充",
              ),
              targetUsers: coerceStringArray(
                (parsed.product as Record<string, unknown>).targetUsers,
              ),
              primaryScenario: coerceString(
                (parsed.product as Record<string, unknown>).primaryScenario,
                "核心使用场景待补充",
              ),
            }
          : parsed.product,
      goals:
        parsed.goals && typeof parsed.goals === "object"
          ? {
              ...parsed.goals,
              primary: coerceStringArray((parsed.goals as Record<string, unknown>).primary),
              secondary: coerceNullableStringArray(
                (parsed.goals as Record<string, unknown>).secondary,
              ),
            }
          : parsed.goals,
      nonGoals: coerceStringArray(parsed.nonGoals),
      assumptions: coerceNullableStringArray(parsed.assumptions),
      category: coerceString(parsed.category, "通用产品"),
    };

    return IntentSchema.parse(normalized);
  } catch {
    return null;
  }
}

export async function intentNode(state: any) {
  if (state.skipGeneration) {
    console.log("[IntentNode] skipGeneration=true, skipping.");
    return {
      intent: null,
    };
  }

  // 1. 获取单例模型 (使用结构化输出)
  const structuredModel = getStructuredModel(IntentSchema);

  // 2. 准备上下文
  // 我们结合用户的原始需求 (analysis.summary) 和可能的补充信息
  const analysisSummary = state.analysis?.summary || "用户未提供有效信息";
  const analysisTags = state.analysis?.tags?.join(", ") || "";

  // 如果有设计稿分析，也带上
  const designContext = state.analysis?.designAnalysis
    ? `\n\n[关联的设计稿分析]: ${state.analysis.designAnalysis}`
    : "";

  const contextMessage = `用户需求总结: ${analysisSummary}\n关键标签: ${analysisTags}${designContext}`;

  // 3. 构建 Prompt
  const prompt = [new SystemMessage(IntentPrompts), new HumanMessage(contextMessage)];

  // 4. 调用模型
  // MOCK MODE Handling
  const mockResult = await tryExecuteMock(state, "intentNode", "intentResult.json", "intent");
  if (mockResult) return mockResult;

  console.log("--- User Intent Analysis Head Start ---");

  let result;
  try {
    // 使用重试机制调用模型
    result = await withRetry(structuredModel, prompt, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.warn(`[IntentNode] Retry attempt ${attempt} due to:`, error.message);
      },
      formatErrorFeedback: (error) =>
        `⚠️ 上一次生成失败，错误信息：\n${error.message}\n\n请仔细检查并修正以下问题：\n1. targetUsers、goals.primary、goals.secondary、nonGoals、assumptions 必须返回真正的数组，不能返回字符串化数组\n2. 不要使用 Markdown、代码块或额外解释，只返回 JSON\n3. product.name、product.description、product.primaryScenario、category 必须是字符串\n4. 如果 secondary 或 assumptions 暂无内容，可返回 [] 或 null\n\n请重新生成正确的 JSON：`,
    });
  } catch (error) {
    const recoveredResult = recoverIntentFromError(error);
    if (!recoveredResult) {
      throw error;
    }

    console.warn(
      "[IntentNode] Recovered from provider output formatting issue by normalizing stringified arrays.",
    );
    result = recoveredResult;
  }

  // console.log("Intent Result:", JSON.stringify(result, null, 2));
  console.log("--- User Intent Analysis End ---");

  // 5. 返回结果
  return {
    intent: result,
  };
}
