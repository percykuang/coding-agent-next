import { ServiceSchema } from "../schemas/serviceSchema.js";
import { LOGIC_SYSTEM_PROMPT } from "../prompts/servicePrompt.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { normalizeCodeFiles } from "../../../../utils/codeNormalizer.js";

// Helper to generate prompt for a single service
const generatePromptForService = (
  model: any,
  mockDataFiles: any[],
  utilsFiles: any[],
  typeFiles: any[],
  intent: any,
) => {
  // 智能查找对应的 Mock 数据文件
  // 策略：文件名包含 modelId (忽略大小写)
  const mockFile = mockDataFiles.find((f) =>
    f.path.toLowerCase().includes(model.modelId.toLowerCase()),
  );

  const mockContext = mockFile
    ? `目标 Mock 数据文件路径: ${mockFile.path}\n(请根据此路径验证 imports)`
    : `警告: 未找到 "${model.modelId}" 的特定 Mock 文件。请推断标准路径 ../data/${model.modelId}.ts`;

  // 简单的 Utils 概览
  const utilsContext =
    utilsFiles.length > 0
      ? `可用工具函数与文件路径:\n${utilsFiles.map((f) => `- ${f.path}`).join("\n")}`
      : "暂无特定生成的工具函数。";

  // 添加 Types 概览
  const typesContext =
    typeFiles.length > 0
      ? `可用类型定义文件路径 (Types):\n${typeFiles.map((f) => `- ${f.path} (${f.description || ""})`).join("\n")}`
      : "暂无特定生成的类型文件。请优先复用 Mock 文件中导出的 Interface。";

  return `
任务：为领域模型 "${model.modelId}" 生成 Service 业务逻辑代码。

【目标领域模型 (Target Domain)】
Model Name: ${model.modelId}
Description: ${model.description}
Fields: ${(model.fields || []).map((f: any) => f.name).join(", ")}

【上下文与依赖 (Context & Dependencies)】
${mockContext}
${typesContext}
${utilsContext}

【应用意图 (App Intent)】
Primary Goals: ${(intent?.goals?.primary || []).map((g: string) => `"${g}"`).join(", ")}

【生成要求 (Requirement)】
- 仅为该领域生成**一个** Service 文件。
- 严格遵循 "imports Strategy" (使用相对路径 import)。
- 确保 JSON 输出安全 (优先使用单引号)。
`;
};

export async function serviceNode(state: T_Graph) {
  // 1. 初始化模型
  const structuredModel = getStructuredModel(ServiceSchema);

  // 2. 获取上下文数据
  const { capabilities, intent, mockData, utils, types } = state;
  const dataModels = capabilities?.dataModels || [];
  const mockDataFiles = (mockData as any)?.files || [];
  const utilsFiles = (utils as any)?.files || []; // 临时绕过类型检查，直到 graphSchema 更新
  const typeFiles = (types as any)?.files || [];

  if (!dataModels.length) {
    console.warn("ServiceNode: Missing dataModels, skipping.");
    return { logic: { files: [] } };
  }

  // MOCK MODE Handling
  const mockResult = await tryExecuteMock(state, "serviceNode", "serviceResult.json", "service");
  if (mockResult) return mockResult;

  console.log(`--- Service Generation Head Start (${dataModels.length} models) ---`);

  // 3. 并发生成 (Concurrency with Retries)
  const tasks = dataModels.map(async (model) => {
    try {
      const humanPrompt = generatePromptForService(
        model,
        mockDataFiles,
        utilsFiles,
        typeFiles,
        intent,
      );
      const messages = [new SystemMessage(LOGIC_SYSTEM_PROMPT), new HumanMessage(humanPrompt)];

      console.log(`Generating service for model: ${model.modelId}...`);

      // 使用重试机制调用模型
      const result = await withRetry(structuredModel, messages, {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          console.warn(
            `[ServiceNode] Retry ${model.modelId} attempt ${attempt} due to:`,
            error.message,
          );
        },
      });

      return result.files || [];
    } catch (error) {
      console.error(`Failed to generate service for ${model.modelId} after retries`, error);
      return []; // 返回空数组以保证 Promise.all 不会全盘崩溃
    }
  });

  // 4. 等待所有任务完成
  const results = await Promise.all(tasks);

  // 5. 聚合结果
  const allFiles = results.flat();
  // 后处理：修复 LLM 输出中可能存在的转义字符问题
  const normalizedFiles = normalizeCodeFiles(allFiles);

  console.log(`Generated ${normalizedFiles.length} service files total.`);
  normalizedFiles.forEach((f: any) => console.log(` - ${f.path}`));
  // console.log(JSON.stringify(normalizedFiles, null, 2));
  console.log("--- Service Generation End ---");

  // 返回更新的状态 (假设 graphSchema 中增加的 key 为 'logic')
  return {
    service: {
      files: normalizedFiles,
    },
  };
}
