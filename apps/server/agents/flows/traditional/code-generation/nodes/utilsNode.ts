import { UtilsGenerationSchema } from "../schemas/utilsSchema.js";
import { UTILS_GENERATION_SYSTEM_PROMPT } from "../prompts/utilsPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { normalizeLLMResult } from "../../../../utils/codeNormalizer.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { T_Graph } from "../../../../shared/schemas/graphSchema.js";

export async function utilsNode(state: T_Graph) {
  // 1. 获取目标任务
  // 从 Step 5 (Structure) 中筛选出需要生成的工具文件
  // generatedBy === "typeDefinition" 是不准确的逻辑，我们应该找 path 为 /lib/utils.ts 的文件
  // 但为了简化，我们通常直接假设需要生成 utils
  const targetFile = state.structure?.files.find(
    (f) => f.path === "/lib/utils.ts" || f.path === "src/lib/utils.ts",
  );

  // 如果没有明确规划 utils 文件，为了健壮性我们也应该生成一个
  // 除非显式配置了 skip
  if (!targetFile) {
    console.log("UtilsNode: No explicit /lib/utils.ts in structure, forcing generation.");
  }

  // 添加mock逻辑
  const mockResult = await tryExecuteMock(state, "utilsNode", "utilsResult.json", "utils");
  if (mockResult) return mockResult;

  // 2. 准备上下文数据 (Inputs)
  const components = state.components?.components || [];
  const dataModels = state.capabilities?.dataModels || [];
  const pages = state.ui?.pages || [];
  const intent = state.intent || {};

  // 构建 Prompt
  const componentsList = components
    .map(
      (c) =>
        `- ${c.componentId}: ${c.description} (Props: ${c.props.map((p) => p.name).join(", ")})`,
    )
    .join("\n");

  const modelsList = dataModels
    .map(
      (m: any) =>
        `- ${m.modelId}: ${(m.fields || [])
          .map((f: any) => (typeof f === "string" ? f : `${f.name}(${f.type})`))
          .join(", ")}`,
    )
    .join("\n");

  const pagesList = pages.map((p) => `- ${p.pageId}: ${p.description}`).join("\n");

  const humanPrompt = `
任务：生成 /lib/utils.ts 的内容

【上下文概览】
这是一个 React + TypeScript + Tailwind CSS 应用。
utils 文件将作为以下组件、数据模型和页面的通用工具库。

1. 需要格式化助手或字符串工具的组件：
${componentsList}

2. 定义了日期、数字和标识符形状的数据模型：
${modelsList}

3. 决定整体业务场景的页面：
${pagesList}

4. 产品意图 (核心功能)：
产品名称: ${(intent as any).product?.name || "Unknown App"}
核心功能: ${(intent as any).goals?.primary?.join(", ") || "None"}

【要求】
- 必须包含 'cn' (用于合并类名) 助手函数。
- 根据上述数据类型推断并生成必要的助手函数（例如：日期格式化、货币格式化、文本截断等）。
- 仅输出整洁的 TypeScript 代码。
`;

  // 3. 调用 LLM
  console.log("--- Utils Generation Head Start ---");

  const model = getStructuredModel(UtilsGenerationSchema);

  try {
    const messages = [
      new SystemMessage(UTILS_GENERATION_SYSTEM_PROMPT),
      new HumanMessage(humanPrompt),
    ];

    // 使用重试机制调用模型
    const result = await withRetry(model, messages, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.warn(`[UtilsNode] Retry attempt ${attempt} due to:`, error.message);
      },
    });

    // 后处理：修复 LLM 输出中可能存在的转义字符问题
    const normalizedResult = normalizeLLMResult(result);

    // console.log("Utils Generation Result:", JSON.stringify(normalizedResult, null, 2));
    console.log("--- Utils Generation End ---");

    return {
      utils: normalizedResult,
    };
  } catch (error) {
    console.error("UtilsNode: Failed to generate utils", error);
    return {
      utils: { files: [] },
    };
  }
}
