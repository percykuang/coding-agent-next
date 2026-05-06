import { ComponentSchema } from "../schemas/componentSchema.js";
import { COMPONENT_SYSTEM_PROMPT } from "../prompts/componentPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import {
  coerceBoolean,
  coerceNullableString,
  coerceObjectArray,
  coerceString,
  coerceStringArray,
  parseLlmOutputObject,
} from "../../../../utils/providerOutputRecovery.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

function recoverComponentsFromError(error: unknown) {
  const parsed = parseLlmOutputObject(error);
  if (!parsed) {
    return null;
  }

  try {
    return ComponentSchema.parse({
      components: coerceObjectArray(parsed.components).map((component) => ({
        componentId: coerceString(component.componentId, "GeneratedComponent"),
        originalId: coerceString(component.originalId, "UnknownSource"),
        type: coerceString(component.type, "Card"),
        description: coerceString(component.description, "组件描述待补充"),
        props: coerceObjectArray(component.props).map((prop) => ({
          name: coerceString(prop.name, "value"),
          type: coerceString(prop.type, "string"),
          description: coerceString(prop.description, "属性描述待补充"),
          required: coerceBoolean(prop.required, false),
        })),
        events: coerceObjectArray(component.events).map((event) => ({
          name: coerceString(event.name, "onAction"),
          description: coerceString(event.description, "事件描述待补充"),
          parameters:
            event.parameters == null
              ? null
              : coerceObjectArray(event.parameters).map((parameter) => ({
                  name: coerceString(parameter.name, "value"),
                  type: coerceString(parameter.type, "string"),
                })),
        })),
        dataDependencies: coerceStringArray(component.dataDependencies),
        shadcnComponent: coerceNullableString(component.shadcnComponent),
      })),
    });
  } catch {
    return null;
  }
}

export async function componentNode(state: any) {
  // 1. 获取模型
  const structuredModel = getStructuredModel(ComponentSchema);

  // 2. 准备上下文
  // 核心依赖：UI Schema (组件树) 和 Capabilities (数据与行为)
  const ui = state.ui;
  const capabilities = state.capabilities;

  if (!ui) {
    console.warn("ComponentNode: No UI data found, skipping.");
    return { components: null };
  }

  const uiContext = JSON.stringify(ui, null, 2);
  const capabilityContext = capabilities ? JSON.stringify(capabilities, null, 2) : "未提供";
  const intentContext = state.intent ? JSON.stringify(state.intent, null, 2) : "未提供";

  // 3. 构建 Prompt
  const humanPrompt = `
任务目标：将粗粒度的 UI 规划转化为详细的可编码组件规格 (Component Specs)。

请综合分析以下上下文：

1. 【用户意图 (User Intent)】
   - 理解业务场景和用户目标，决定组件需要展示什么数据，提供什么交互。
   ${intentContext}

2. 【数据能力 (Capabilities)】
   - 这是“后端”契约。查看这里定义的数据模型 (Model) 和字段，确保组件的 Props 类型与数据模型一致。
   ${capabilityContext}

3. 【UI 结构 (UI Schema)】
   - 这是“视觉”骨架。请找到页面中定义的各个组件节点，为它们填充详细的 Props 和 State 定义。
   ${uiContext}

请输出结构化的组件设计，特别注意：
- 能够准确推断 props 的类型 (基本类型 vs 引用 Model)。
- 识别组件是否需要内部 State 或副作用 (Hooks)。
`;

  const messages = [new SystemMessage(COMPONENT_SYSTEM_PROMPT), new HumanMessage(humanPrompt)];

  // 4. 调用模型
  // MOCK MODE Handling
  const mockResult = await tryExecuteMock(
    state,
    "componentNode",
    "componentResult.json",
    "components",
  );
  if (mockResult) return mockResult;

  console.log("--- Component Specs Generation Head Start ---");

  let result;
  try {
    result = await withRetry(structuredModel, messages, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.warn(`[ComponentNode] Retry attempt ${attempt} due to:`, error.message);
      },
      formatErrorFeedback: (error) =>
        `⚠️ 上一次生成失败，错误信息：\n${error.message}\n\n请仔细检查并修正以下问题：\n1. 所有数组字段都必须返回数组，不能返回 null；例如 components、props、events、dataDependencies 必须是 [] 或有效数组\n2. event.parameters 可以是 null 或数组，但不能是对象或字符串\n3. required 必须是布尔值 true 或 false\n4. shadcnComponent 可以是字符串或 null\n\n请重新生成正确的 JSON：`,
    });
  } catch (error) {
    const recoveredResult = recoverComponentsFromError(error);
    if (!recoveredResult) {
      throw error;
    }

    console.warn(
      "[ComponentNode] Recovered from provider output formatting issue by normalizing nullable/stringified arrays.",
    );
    result = recoveredResult;
  }

  // console.log("Component Result:", JSON.stringify(result, null, 2));
  console.log("--- Component Specs Generation End ---");

  // 5. 返回
  return {
    components: result,
  };
}
