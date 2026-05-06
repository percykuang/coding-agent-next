import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { StructureSchema } from "../schemas/structureSchema.js";
import { STRUCTURE_SYSTEM_PROMPT } from "../prompts/structurePrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import {
  coerceEnumString,
  coerceNullableString,
  coerceObjectArray,
  coerceString,
  parseLlmOutputObject,
} from "../../../../utils/providerOutputRecovery.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

const FILE_KINDS = ["template", "overwrite", "new"] as const;

function recoverStructureFromError(error: unknown) {
  const parsed = parseLlmOutputObject(error);
  if (!parsed) {
    return null;
  }

  try {
    return StructureSchema.parse({
      files: coerceObjectArray(parsed.files).map((file) => {
        const path = coerceString(file.path, "/generated.ts");

        return {
          path: path.startsWith("/") ? path : `/${path}`,
          kind: coerceEnumString(file.kind, FILE_KINDS, "new"),
          description: coerceString(file.description, "文件描述待补充"),
          sourceCorrelation: coerceNullableString(file.sourceCorrelation),
          generatedBy: coerceString(file.generatedBy, "scaffold"),
        };
      }),
    });
  } catch {
    return null;
  }
}

// 结构规划节点 (Step 5)
export const structureNode = async (state: T_Graph) => {
  const model = getStructuredModel(StructureSchema);

  // 提取上下文
  const componentSpecs = state.components?.components || [];
  const dataModels = state.capabilities?.dataModels || [];
  const pages = state.ui?.pages || [];

  // 构建输入描述
  const componentsList = componentSpecs
    .map(
      (c) =>
        `- ComponentId: ${c.originalId || c.componentId} (Props: ${c.props.length}, Events: ${c.events.length})`,
    )
    .join("\n");

  const modelsList = dataModels
    .map((m) => `- ModelId: ${m.modelId} (Desc: ${m.description})`)
    .join("\n");

  const pagesList = pages.map((p) => `- PageId: ${p.pageId} (Route: ${p.route})`).join("\n");

  const existingFiles = state.existingFiles || {};
  const existingFilePaths = Object.keys(existingFiles).sort((left, right) =>
    left.localeCompare(right),
  );
  const existingFilesContext =
    existingFilePaths.length > 0
      ? `5. 【现有项目文件】\n   - 当前项目已有 ${existingFilePaths.length} 个文件。\n   - 优先复用现有路径，只有在确实需要新增模块时才创建新文件。\n   - 已有关键文件：\n${existingFilePaths
          .slice(0, 30)
          .map((filePath) => `   - ${filePath}`)
          .join("\n")}`
      : "";

  const userPrompt = `
任务目标：将架构规划转化为具体的文件系统路径列表。

请基于以下上下文生成完整的文件清单：

1. 【UI 页面规划 (Step 3)】
   - 必须为每个 Page 生成 /pages/{PageName}.tsx 文件。
   ${pagesList}

2. 【业务组件规格 (Step 4)】
   - 必须为每个 Component 生成 /components/{ComponentName}.tsx 文件。
   ${componentsList}

3. 【数据模型定义 (Step 2)】
   - 必须为每个 Model 生成 /types/{ModelName}.ts (类型) 和 /data/{ModelName}.ts (Mock数据) 文件。
   ${modelsList}

4. 【现有模板上下文】
   - 包含 /App.tsx, /index.tsx 等基础文件，请根据需要在输出中包含 update/overwrite 指令。
   - 不要重复生成 package.json 或 tsconfig.json 除非必须修改。

${existingFilesContext}
`;

  const messages = [new SystemMessage(STRUCTURE_SYSTEM_PROMPT), new HumanMessage(userPrompt)];

  // MOCK MODE Handling
  const mockResult = await tryExecuteMock(
    state,
    "structureNode",
    "structureResult.json",
    "structure",
  );
  if (mockResult) return mockResult;

  console.log("--- Project Structure Planning Head Start ---");

  let response;
  try {
    response = await withRetry(model, messages, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.warn(`[StructureNode] Retry attempt ${attempt} due to:`, error.message);
      },
      formatErrorFeedback: (error) =>
        `⚠️ 上一次生成失败，错误信息：\n${error.message}\n\n请仔细检查并修正以下问题：\n1. files 必须始终返回数组，不能返回 null\n2. kind 只允许：template, overwrite, new\n3. path 必须是字符串，并且以 / 开头\n4. sourceCorrelation 只能是字符串或 null\n\n请重新生成正确的 JSON：`,
    });
  } catch (error) {
    const recoveredResult = recoverStructureFromError(error);
    if (!recoveredResult) {
      throw error;
    }

    console.warn(
      "[StructureNode] Recovered from provider output formatting issue by normalizing nullable/stringified arrays.",
    );
    response = recoveredResult;
  }

  console.log("Structure Result:", JSON.stringify(response, null, 2));
  console.log("--- Project Structure Planning End ---");

  return {
    structure: response,
  };
};
