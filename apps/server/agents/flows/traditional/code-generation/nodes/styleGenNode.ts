import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { StyleGenSchema } from "../schemas/styleGenSchema.js";
import { STYLE_GEN_SYSTEM_PROMPT } from "../prompts/styleGenPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { normalizeLLMResult } from "../../../../utils/codeNormalizer.js";
import { withRetry } from "../../../../utils/retry.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

/**
 * Step 14: 全局样式生成节点
 *
 * 根据页面结构、组件列表和依赖信息，生成 styles.css 文件。
 * 该文件与 Tailwind CSS 互补，提供 CSS 变量、布局容器和动画效果。
 */
export async function styleGenNode(state: T_Graph) {
  // 1. MOCK MODE Logic (优先处理)
  const mockResult = await tryExecuteMock(
    state,
    "styleGenNode",
    "styleGenResult.json",
    (result) => {
      console.log(`--- StyleGenNode Loaded Mock Data ---`);
      return { styles: result };
    },
  );
  if (mockResult) return mockResult;

  console.log(`--- StyleGenNode HEAD Start ---`);

  // 2. 准备上下文数据
  // 2.1 页面结构信息 (UI Spec)
  const uiSpec = state.ui;
  const pages = uiSpec?.pages || [];
  const pagesContext = pages
    .map((p) => `- ${p.pageId}: ${p.route} (Layout: ${p.layout || "default"})`)
    .join("\n");

  // 2.2 组件列表 (Components)
  const components = state.components?.components || [];
  const componentsContext = components
    .map((c) => `- ${c.componentId}: ${c.type} - ${c.description || ""}`)
    .join("\n");

  // 2.3 依赖信息 (Dependencies)
  // 使用 packageJson 获取完整依赖（包括模板预置的 + LLM 推荐的）
  // tailwindcss 通常在 devDependencies 中，所以需要同时检查 dependencies 和 devDependencies
  const fullDependencies = state.dependency?.packageJson?.dependencies || {};
  const devDependencies = state.dependency?.packageJson?.devDependencies || {};
  const hasTailwind =
    "tailwindcss" in fullDependencies ||
    "tailwindcss" in devDependencies ||
    "tailwind" in fullDependencies ||
    "tailwind" in devDependencies;
  const dependencyContext = `CSS Framework: ${hasTailwind ? "Tailwind CSS (已确认)" : "未检测到 Tailwind，请生成更完整的基础样式"}`;

  // 3. 构建 User Prompt
  const userPrompt = `
【任务】
为该应用生成全局样式文件 styles.css。

【页面结构 (共 ${pages.length} 个页面)】
${pagesContext || "暂无页面信息"}

【组件列表 (共 ${components.length} 个组件)】
${componentsContext || "暂无组件信息"}

【依赖信息】
${dependencyContext}

【要求】
1. 生成的 CSS 应与 Tailwind 互补，不要重复定义 Tailwind 已有的工具类
2. 必须包含 :root CSS 变量定义（颜色、间距、圆角等）
3. 必须包含页面布局容器类
4. 必须包含至少一个动画定义
5. 代码精简，控制在 80-150 行

请生成符合 StyleGenSchema 的 JSON 输出。
`;

  // 4. 调用 LLM 生成
  const model = getStructuredModel(StyleGenSchema);

  try {
    const messages = [new SystemMessage(STYLE_GEN_SYSTEM_PROMPT), new HumanMessage(userPrompt)];

    const result = await withRetry(model, messages, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.warn(`[StyleGenNode] Retry attempt ${attempt} due to:`, error.message);
      },
    });

    // 后处理：修复 LLM 输出中可能存在的转义字符问题
    const normalizedResult = normalizeLLMResult(result);

    console.log(`--- StyleGenNode Generated: ${normalizedResult.path} ---`);
    //     console.log(`
    // ==================================================
    // [StyleGenNode] 🟢 Generated: ${normalizedResult.path}
    // ==================================================
    // ${normalizedResult.content}
    // ==================================================
    // `);

    return {
      styles: normalizedResult,
    };
  } catch (error) {
    console.error("StyleGenNode Error:", error);
    throw new Error(`StyleGenNode failed: ${error}`);
  }
}
