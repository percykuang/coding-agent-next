import type { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { HOOKS_SYSTEM_PROMPT } from "../prompts/hooksPrompts.js";
import { HooksSchema } from "../schemas/hooksSchema.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import { normalizeCodeFile } from "../../../../utils/codeNormalizer.js";

export const hooksNode = async (state: T_Graph) => {
  // MOCK MODE Handling
  const mockResult = await tryExecuteMock(state, "hooksNode", "hooksResult.json", "hooks");
  if (mockResult) return mockResult;

  const { structure, service, mockData, capabilities } = state as any;

  const allStructureFiles = structure?.files || [];
  const targetFiles = allStructureFiles.filter(
    (f: any) => f.path.includes("/hooks/") || f.path.split("/").pop()?.startsWith("use"),
  );

  const serviceFiles = (service as any)?.files || (service as any)?.logic?.files || [];
  const mockDataFiles = (mockData as any)?.files || [];

  console.log(`[HooksNode] Starting generation for ${targetFiles.length} files...`);

  // 1. 准备上下文 (Prepare Context)
  // 必须包含 Service (Logic) 和 MockData (Types)
  const serviceContext =
    serviceFiles.map((s: any) => `// Path: ${s.path}\n${s.content}`).join("\n\n") || "";
  const typeContext =
    mockDataFiles.map((m: any) => `// Path: ${m.path}\n${m.content}`).join("\n\n") || "";
  const intentContext = JSON.stringify(capabilities || {}, null, 2);

  // 预组装通用上下文 Prompt，避免在循环中重复拼接
  const baseContextPrompt = `
【依赖上下文 (Dependencies Context)】
1. **API 服务层 (Services)**:
   (请直接调用这些函数获取数据。如果有现成的 Service，严禁在 Hook 中手写 Mock 数据)
${serviceContext}

2. **类型定义 (Types & Models)**:
${typeContext}

3. **业务需求 (Requirements)**:
${intentContext}

【通用要求 (General Requirements)】
- 使用标准的 React Hooks (useState, useEffect, useCallback)。
- 从相对路径导入 Service (e.g. '../services/xxxService')。
- 保证严格的 TypeScript 类型安全。
`;

  // 2. 并发生成 (Parallel Generation)
  const results = await Promise.all(
    targetFiles.map(async (fileItem: any) => {
      const filePath = typeof fileItem === "string" ? fileItem : fileItem.path;
      const fileDesc = typeof fileItem === "string" ? "" : fileItem.description;

      console.log(`[HooksNode] Generating ${filePath}...`);

      const userPrompt = `
当前任务: 生成 Hook 文件: "${filePath}"
文件描述: ${fileDesc}

${baseContextPrompt}
`;

      const model = getStructuredModel(HooksSchema);
      const messages = [
        { role: "system", content: HOOKS_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ];

      // 使用重试机制调用模型
      const result = await withRetry(model, messages, {
        maxRetries: 3,
        onRetry: (attempt, error) => {
          console.warn(`[HooksNode] Retry ${filePath} attempt ${attempt} due to:`, error.message);
        },
      });

      // Normalize output: Schema might return { files: [...] } or direct array
      const generatedFiles = (result as any).files || (Array.isArray(result) ? result : [result]);

      // Filtering logic: ensure we get the file we wanted
      const targetFile = generatedFiles.find((f: any) =>
        f.path.endsWith(filePath.split("/").pop()!),
      );

      if (!targetFile) {
        // Fallback: take the first one if path didn't match perfectly but content exists
        if (generatedFiles.length > 0) return normalizeCodeFile(generatedFiles[0]);
        throw new Error("No file content generated");
      }

      return normalizeCodeFile(targetFile);
    }),
  );

  console.log(`[HooksNode] Generated ${results.length} hook files total.`);
  results.forEach((f: any) => console.log(` - ${f.path}`));
  // console.log(JSON.stringify(results, null, 2));
  console.log("--- Hooks Generation End ---");

  return {
    hooks: {
      files: results,
    },
  };
};
