import { MockDataSchema } from "../schemas/mockDataSchema.js";
import { MOCK_DATA_SYSTEM_PROMPT } from "../prompts/mockDataPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { normalizeCodeFiles } from "../../../../utils/codeNormalizer.js";
import { T_Graph } from "../../../../shared/schemas/graphSchema.js";

// Helper to generate prompt for a single model
const generatePromptForModel = (model: any, intent: any, structureFiles: any[]) => {
  // 1. 尝试从 Step 5 (Structure) 中查找该模型对应的数据文件路径
  // 查找策略：
  // - sourceCorrelation 匹配 modelId
  // - generatedBy 为 "mockData"
  // - 或者路径包含 modelId
  const targetFile = structureFiles.find(
    (f) =>
      (f.sourceCorrelation === model.modelId && f.generatedBy === "mockData") ||
      (f.path.includes(model.modelId) && f.path.includes("/data/")),
  );

  // 2. 决定目标路径
  // 如果找到了规划路径，就用规划的；否则使用默认的 fallback 路径
  // 默认路径改为 /data/xxx.ts，符合项目规划
  const defaultPath = `/data/${model.modelId}Data.ts`;
  const targetPath = targetFile ? targetFile.path : defaultPath;

  return `
请生成数据模型 "${model.modelId}" 的 Mock 数据文件。

【Model Definition】
Name: ${model.modelId}
Description: ${model.description}
Fields:
${(model.fields || []).map((f: any) => `- ${typeof f === "string" ? f : `${f.name}: ${f.type} (${f.description || ""})`}`).join("\n")}

【Target File】
Path: ${targetPath}

【Context】
App Intent: ${(intent?.goals?.primary || []).join(", ")}
Category: ${intent?.category || "General"}

【Requirement】
- 仅生成这一个文件。
- 确保包含 Types 定义和 Mock Data 数组。
- 严禁包含无关代码。
`;
};

export async function mockDataNode(state: T_Graph) {
  // 1. 获取模型 & 准备上下文
  const structuredModel = getStructuredModel(MockDataSchema);
  // 从 state.structure 中获取文件列表
  const { capabilities, intent, structure } = state;
  const dataModels = capabilities?.dataModels || [];
  const structureFiles = structure?.files || [];

  if (!dataModels.length) {
    console.warn("MockDataNode: Missing dataModels, skipping.");
    return { mockData: { files: [] } };
  }

  // 2. MOCK MODE Handling (Keep existing logic if needed, or update to use shouldMock)
  const mockResult = await tryExecuteMock(state, "mockDataNode", "mockDataResult.json", "mockData");
  if (mockResult) return mockResult;

  // 3. In-Node Parallelism Execution
  console.log(`--- Mock Data Generation Head Start (${dataModels.length} models) ---`);

  // 为每个 Model 创建并发任务
  const tasks = dataModels.map(async (model) => {
    try {
      const humanPrompt = generatePromptForModel(model, intent, structureFiles);
      const messages = [new SystemMessage(MOCK_DATA_SYSTEM_PROMPT), new HumanMessage(humanPrompt)];

      console.log(`Generating mock for model: ${model.modelId}...`);

      // 使用重试机制调用模型
      const result = await withRetry(structuredModel, messages, {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          console.warn(
            `[MockDataNode] Retry ${model.modelId} attempt ${attempt} due to:`,
            error.message,
          );
        },
      });

      return result.files || [];
    } catch (error) {
      console.error(`Failed to generate mock for ${model.modelId} after retries`, error);
      return []; // Return empty array on failure to avoid breaking Promise.all
    }
  });

  // 等待所有任务完成
  const results = await Promise.all(tasks);

  // 4. Aggregate Results
  // Flatten array of arrays: [[file1], [file2]] -> [file1, file2]
  const allFiles = results.flat();
  // 后处理：修复 LLM 输出中可能存在的转义字符问题
  const normalizedFiles = normalizeCodeFiles(allFiles);

  console.log(`Generated ${normalizedFiles.length} mock data files total.`);
  normalizedFiles.forEach((f: any) => console.log(` - ${f.path}`));
  // console.log(JSON.stringify(normalizedFiles, null, 2));
  console.log("--- Mock Data Generation End ---");

  return {
    mockData: {
      files: normalizedFiles,
    },
  };
}
