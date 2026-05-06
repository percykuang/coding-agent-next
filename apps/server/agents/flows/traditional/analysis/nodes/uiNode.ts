import { UISchema } from "../schemas/uiSchema.js";
import { UI_SYSTEM_PROMPT } from "../prompts/uiPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import {
  coerceObjectArray,
  coerceString,
  coerceStringArray,
  parseLlmOutputObject,
} from "../../../../utils/providerOutputRecovery.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

function recoverUIFromError(error: unknown) {
  const parsed = parseLlmOutputObject(error);
  if (!parsed) {
    return null;
  }

  try {
    const normalized = {
      pages: coerceObjectArray(parsed.pages).map((page) => ({
        pageId: coerceString(page.pageId, "GeneratedPage"),
        route: coerceString(page.route, "/"),
        description: coerceString(page.description, "页面描述待补充"),
        layout: coerceString(page.layout, "default"),
        sections: coerceObjectArray(page.sections).map((section) => ({
          sectionId: coerceString(section.sectionId, "content"),
          role: coerceString(section.role, "dashboard"),
          layout: coerceString(section.layout, "single"),
          title: coerceString(section.title, "内容区"),
          components: coerceObjectArray(section.components).map((component) => ({
            id: coerceString(component.id, "GeneratedComponent"),
            type: coerceString(component.type, "Card"),
            label: coerceString(component.label, "未命名组件"),
            bindDataModel: coerceString(component.bindDataModel, ""),
            bindBehavior: coerceStringArray(component.bindBehavior),
          })),
        })),
      })),
      themeStrategy: coerceString(parsed.themeStrategy, "现代简洁风格"),
    };

    return UISchema.parse(normalized);
  } catch {
    return null;
  }
}

export async function uiNode(state: any) {
  // 1. 获取模型
  const structuredModel = getStructuredModel(UISchema);

  // 2. 准备上下文
  // 核心依赖：Capabilities (逻辑骨架)
  const capabilities = state.capabilities;

  if (!capabilities) {
    console.warn("UINode: No capability data found, skipping.");
    return { ui: null };
  }

  // 辅助依赖：Intent (产品目标) 和 Analysis (视觉偏好)
  const intentContext = state.intent ? JSON.stringify(state.intent, null, 2) : "未提供";
  const analysisContext = state.analysis ? JSON.stringify(state.analysis, null, 2) : "未提供";

  const capabilityContext = JSON.stringify(capabilities, null, 2);

  // 3. 构建 Prompt
  // 我们将所有上游信息汇总给模型
  const humanPrompt = `
请基于以下信息生成 UI 架构设计：

【Intent (产品意图)】
${intentContext}

【Capabilities (技术能力规划)】
${capabilityContext}

【Analysis (视觉/设计分析)】
${analysisContext}
`;

  const messages = [new SystemMessage(UI_SYSTEM_PROMPT), new HumanMessage(humanPrompt)];

  // 4. 调用模型
  // MOCK MODE Handling
  const mockResult = await tryExecuteMock(state, "uiNode", "uiResult.json", "ui");
  if (mockResult) return mockResult;

  console.log("--- UI Architecture Analysis Head Start ---");

  // 使用带错误反馈的重试机制（自定义错误提示以强调 role 枚举值）
  let result;
  try {
    result = await withRetry(structuredModel, messages, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.warn(`[UINode] Retry attempt ${attempt} due to:`, error.message);
      },
      formatErrorFeedback: (error) =>
        `⚠️ 上一次生成失败，错误信息：\n${error.message}\n\n请仔细检查并修正以下问题：\n1. 确保所有 section 的 role 字段只使用合法枚举值：navigation, filter, list, detail, editor, dashboard, form\n2. 确保所有组件的 type 字段只使用 Schema 定义的组件类型\n3. 所有数组字段都必须返回数组，不能返回 null；例如 pages、sections、components、bindBehavior 必须是 [] 或有效数组\n4. 确保 JSON 格式正确，没有遗漏必填字段\n\n请重新生成正确的 JSON：`,
    });
  } catch (error) {
    const recoveredResult = recoverUIFromError(error);
    if (!recoveredResult) {
      throw error;
    }

    console.warn(
      "[UINode] Recovered from provider output formatting issue by normalizing nullable/stringified arrays.",
    );
    result = recoveredResult;
  }

  console.log("--- UI Architecture Analysis End ---");

  return {
    ui: result,
  };
}
