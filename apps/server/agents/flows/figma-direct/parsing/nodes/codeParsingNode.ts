/**
 * Figma 直连流程 - 代码结构解析节点
 *
 * 职责：
 * 1. 接收 figmaInputNode 输出的 rawCode（MCP 生成的单文件代码）
 * 2. 使用 AI 分析代码结构（组件、资源、依赖等）
 * 3. 输出结构化的解析结果，作为后续拆分的依据
 *
 * 流程位置: Step 2 / 4
 * 上游: figmaInputNode (rawCode)
 * 下游: refactoringNode (拆分组件)
 *
 * 注意：由于代码可能很长（79K+ 字符），需要确保模型上下文窗口足够
 */

import { CodeParsingSchema, type T_CodeParsing } from "../schemas/codeParsingSchema.js";
import { CODE_PARSING_SYSTEM_PROMPT } from "../prompts/codeParsingPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { withRetry } from "../../../../utils/retry.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export const codeParsingNode = async (state: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("🔍 [CodeParsingNode] 开始解析代码结构");
  console.log("=".repeat(80));

  const { rawCode, codeLength, lineCount } = state;

  // ========== 1. 校验输入 ==========
  if (!rawCode) {
    console.error("❌ [CodeParsingNode] 错误: 缺少 rawCode");
    throw new Error("CodeParsingNode: 缺少 rawCode，请确保 figmaInputNode 已正确运行");
  }

  console.log(
    `📊 [CodeParsingNode] 输入代码: ${codeLength?.toLocaleString() || "?"} 字符, ${lineCount || "?"} 行`,
  );

  // ========== 2. 为代码添加行号（方便 AI 标注行号） ==========
  const numberedCode = rawCode
    .split("\n")
    .map((line: string, i: number) => `${String(i + 1).padStart(4, " ")} | ${line}`)
    .join("\n");

  console.log("📝 [CodeParsingNode] 已为代码添加行号标注");

  // ========== 3. 构建 AI 消息 ==========
  const userPrompt = `
请分析以下 Figma 自动生成的 React 代码的结构。

**代码信息**:
- 总字符数: ${codeLength}
- 总行数: ${lineCount}

**带行号的代码**:
\`\`\`tsx
${numberedCode}
\`\`\`

请严格按照 Schema 定义输出 JSON 结果，识别所有组件、资源、依赖和建议的目录结构。
`;

  const messages = [new SystemMessage(CODE_PARSING_SYSTEM_PROMPT), new HumanMessage(userPrompt)];

  // ========== 4. 调用 AI 分析 ==========
  console.log("⏳ [CodeParsingNode] 正在调用 AI 分析代码结构...");

  const model = getStructuredModel(CodeParsingSchema);

  const result: T_CodeParsing = await withRetry(model, messages, {
    maxRetries: 3,
    onRetry: (attempt, error) => {
      console.warn(`⚠️ [CodeParsingNode] 第 ${attempt} 次重试，原因: ${error.message}`);
    },
  });

  // ========== 5. 打印解析结果 ==========
  console.log("\n✅ [CodeParsingNode] 代码结构解析完成");
  console.log(`   📦 识别组件: ${result.components.length} 个`);

  result.components.forEach((comp) => {
    console.log(
      `      - [${comp.type}] ${comp.name} (L${comp.startLine}-L${comp.endLine}) ${comp.description}`,
    );
    if (comp.dependsOn.length > 0) {
      console.log(`        依赖: ${comp.dependsOn.join(", ")}`);
    }
  });

  console.log(`   🖼️  全局资源: ${result.globalAssets.length} 个`);
  console.log(`   🎨 样式策略: ${result.styleStrategy}`);
  console.log(`   📦 第三方依赖: ${result.dependencies.join(", ") || "无"}`);
  console.log(`   📁 建议目录结构:`);
  console.log(`      - components/: ${result.suggestedStructure.components.length} 个`);
  console.log(`      - pages/:      ${result.suggestedStructure.pages.length} 个`);
  console.log(`      - utils/:      ${result.suggestedStructure.utils.length} 个`);
  console.log(`   🏠 入口组件: ${result.codeQuality.entryComponent}`);
  console.log("");

  // ========== 6. 返回结果 ==========
  return {
    parsedStructure: result,
  };
};
