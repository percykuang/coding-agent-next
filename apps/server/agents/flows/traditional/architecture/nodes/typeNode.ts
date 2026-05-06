import * as fs from "fs";
import * as path from "path";
import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { TypeFileSchema } from "../schemas/typeSchema.js";
import { TYPE_GENERATION_SYSTEM_PROMPT } from "../prompts/typePrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { normalizeCodeFile } from "../../../../utils/codeNormalizer.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export async function typeNode(state: T_Graph) {
  // 1. 获取目标任务
  // 从 Step 5 (Structure) 中筛选出需要生成的类型文件
  // generatedBy === "typeDefinition"
  const targetFiles =
    state.structure?.files.filter((f) => f.generatedBy === "typeDefinition") || [];

  if (targetFiles.length === 0) {
    console.warn("TypeNode: No type definition files found in structure plan.");
    return { types: { files: [] } };
  }

  // 2. 准备上下文数据
  const dataModels = state.capabilities?.dataModels || [];
  const existingModelNames = dataModels.map((m) => m.modelId).join(", ");

  // 3. MOCK MODE Logic (优先处理)
  const mockResult = await tryExecuteMock(state, "typeNode", "typeResult.json", (result) => {
    const mockFiles = result.files || [];
    console.log(`--- Type Generation Loaded Mock Data (${mockFiles.length} files) ---`);
    return { types: { files: mockFiles } };
  });
  if (mockResult) return mockResult;

  // 4. 并发生成逻辑 (Real LLM)
  console.log(`--- Type Generation HEAD Start (${targetFiles.length} files) ---`);

  const model = getStructuredModel(TypeFileSchema);

  // 并行执行所有的生成任务
  const generatePromises = targetFiles.map(async (fileNode) => {
    const modelId = fileNode.sourceCorrelation;
    const modelDef = dataModels.find((m) => m.modelId === modelId);

    if (!modelDef) {
      console.warn(`TypeNode: Model definition not found for ${modelId}, skipping.`);
      return null;
    }

    // 构建针对单个模型的 Prompt
    const modelContext = JSON.stringify(modelDef, null, 2);
    const userPrompt = `
任务目标：为数据模型 "${modelId}" 生成 TypeScript 类型定义。
文件路径：${fileNode.path}

【目标模型详情】
${modelContext}

【可用模型列表 (用于引用)】
${existingModelNames}

请生成完整的 .ts 文件内容，包含 imports, JSDoc 和 interface 定义。
`;

    try {
      const messages = [
        new SystemMessage(TYPE_GENERATION_SYSTEM_PROMPT),
        new HumanMessage(userPrompt),
      ];

      // 使用重试机制调用模型
      const result = await withRetry(model, messages, {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          console.warn(
            `[TypeNode] Retry ${fileNode.path} attempt ${attempt} due to:`,
            error.message,
          );
        },
      });

      // 回填 path (LLM 有时会乱改 path，强行纠正为规划的 path)
      // 后处理：修复 LLM 输出中可能存在的转义字符问题
      return normalizeCodeFile({
        ...result,
        path: fileNode.path,
        modelId: modelId || "Unknown", // 确保 modelId 存在
      });
    } catch (error) {
      console.error(`TypeNode: Failed to generate ${fileNode.path}`, error);
      return null;
    }
  });

  const results = await Promise.all(generatePromises);
  const validResults = results.filter((r) => r !== null) as any[];

  // console.log(
  //   "Type Generation Results:",
  //   JSON.stringify(validResults, null, 2),
  // );

  console.log(`--- Type Generation End (Generated ${validResults.length}) ---`);

  return {
    types: {
      files: validResults,
    },
  };
}
