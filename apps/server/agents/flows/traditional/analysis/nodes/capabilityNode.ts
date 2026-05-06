import { CapabilitySchema } from "../schemas/capabilitySchema.js";
import { CAPABILITY_SYSTEM_PROMPT } from "../prompts/capabilityPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import {
  coerceBoolean,
  coerceEnumString,
  coerceObjectArray,
  coerceString,
  coerceStringArray,
  parseLlmOutputObject,
} from "../../../../utils/providerOutputRecovery.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

const PAGE_TYPES = [
  "landing",
  "dashboard",
  "list",
  "detail",
  "form",
  "workspace",
  "settings",
  "profile",
  "other",
] as const;

const COMPLEXITY_TYPES = ["simple", "static", "list+detail", "complex"] as const;

function isScreenshotReplicaAnalysis(state: any) {
  const text = [
    state.analysis?.summary,
    state.analysis?.designAnalysis,
    state.intent?.product?.description,
    state.intent?.product?.primaryScenario,
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n");

  return /截图复刻|按图还原|单页还原|网页复刻|搜索首页|官网首页/.test(text);
}

function recoverCapabilitiesFromError(error: unknown) {
  const parsed = parseLlmOutputObject(error);
  if (!parsed) {
    return null;
  }

  try {
    return CapabilitySchema.parse({
      pages: coerceObjectArray(parsed.pages).map((page) => ({
        pageType: coerceEnumString(page.pageType, PAGE_TYPES, "other"),
        pageId: coerceString(page.pageId, "GeneratedPage"),
        description: coerceString(page.description, "页面描述待补充"),
        supportedGoals: coerceStringArray(page.supportedGoals),
      })),
      behaviors: coerceObjectArray(parsed.behaviors).map((behavior) => ({
        behaviorId: coerceString(behavior.behaviorId, "generatedBehavior"),
        description: coerceString(behavior.description, "行为描述待补充"),
        scope: coerceStringArray(behavior.scope),
        optional: coerceBoolean(behavior.optional, false),
      })),
      dataModels: coerceObjectArray(parsed.dataModels).map((model) => ({
        modelId: coerceString(model.modelId, "GeneratedModel"),
        description: coerceString(model.description, "模型描述待补充"),
        complexity: coerceEnumString(model.complexity, COMPLEXITY_TYPES, "simple"),
        fields: coerceStringArray(model.fields),
      })),
    });
  } catch {
    return null;
  }
}

export async function capabilityNode(state: any) {
  // 1. 获取单例模型 (使用结构化输出)
  const structuredModel = getStructuredModel(CapabilitySchema);

  // 2. 准备上下文
  // 能力分析强依赖于 Intent 意图分析的结果
  const intentData = state.intent;

  if (!intentData) {
    console.warn("CapabilityNode: No intent data found, skipping.");
    return { capabilities: null };
  }

  const intentContext = JSON.stringify(intentData, null, 2);
  const designContext = state.analysis?.designAnalysis
    ? `\n\n[关联视觉分析]\n${state.analysis.designAnalysis}`
    : "";
  const replicaContext = isScreenshotReplicaAnalysis(state)
    ? `\n\n[额外约束]\n当前需求更接近网页截图复刻或首页还原任务。优先规划单个核心页面（通常是 landing 或 other），不要擅自拆出 dashboard、list、detail、form、workspace 等多页结构；除非用户明确要求，否则不要虚构复杂数据模型和后台管理能力。`
    : "";

  // 3. 构建消息
  // 让模型扮演架构师，基于 input (Intent) 输出 output (Capabilities)
  const messages = [
    new SystemMessage(CAPABILITY_SYSTEM_PROMPT),
    new HumanMessage(
      `请基于以下产品意图进行能力分析：\n${intentContext}${designContext}${replicaContext}`,
    ),
  ];

  // 4. 调用模型
  // MOCK MODE Handling
  const mockResult = await tryExecuteMock(
    state,
    "capabilityNode",
    "capabilityResult.json",
    "capabilities",
  );
  if (mockResult) return mockResult;

  console.log("--- Capability Analysis Head Start ---");

  let result;
  try {
    result = await withRetry(structuredModel, messages, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.warn(`[CapabilityNode] Retry attempt ${attempt} due to:`, error.message);
      },
      formatErrorFeedback: (error) =>
        `⚠️ 上一次生成失败，错误信息：\n${error.message}\n\n请仔细检查并修正以下问题：\n1. 所有数组字段都必须返回数组，不能返回 null；例如 pages、behaviors、dataModels、supportedGoals、scope、fields 必须是 [] 或有效数组\n2. pageType 只允许：landing, dashboard, list, detail, form, workspace, settings, profile, other\n3. complexity 只允许：simple, static, list+detail, complex\n4. optional 必须是布尔值 true 或 false\n\n请重新生成正确的 JSON：`,
    });
  } catch (error) {
    const recoveredResult = recoverCapabilitiesFromError(error);
    if (!recoveredResult) {
      throw error;
    }

    console.warn(
      "[CapabilityNode] Recovered from provider output formatting issue by normalizing nullable/stringified arrays.",
    );
    result = recoveredResult;
  }

  // console.log("Capability Result:", JSON.stringify(result, null, 2));
  console.log("--- Capability Analysis End ---");

  // 5. 返回更新后的状态
  return {
    capabilities: result,
  };
}
