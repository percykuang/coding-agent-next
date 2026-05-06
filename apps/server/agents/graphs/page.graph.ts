import { StateGraph, Annotation, Send, END, START } from "@langchain/langgraph";
import { PageGenSchema } from "../flows/traditional/code-generation/schemas/pageGenSchema.js";
import { PAGE_GEN_SYSTEM_PROMPT } from "../flows/traditional/code-generation/prompts/pageGenPrompts.js";
import { getStructuredModel } from "../utils/model.js";
import { normalizeLLMResult } from "../utils/codeNormalizer.js";
import { processGeneratedCode } from "../utils/ast/fixer.js";

// 1. 定义子图状态 (Subgraph State)
// 这是子图中流转的最小数据集
export const PageState = Annotation.Root({
  // 输入：所有需要生成的页面列表
  pagesToGenerate: Annotation<any[]>(),

  // 上下文：生成所需的依赖 (Hooks, Components Code, etc.)
  context: Annotation<{
    hooks: any; // Hook 定义
    componentResult: any[]; // 已生成的组件代码
    types: any; // 类型定义（供 AST 后处理使用）
    analysis?: any;
    intent?: any;
    ui?: any;
    existingFiles?: Record<string, string>;
  }>(),

  // (Map步骤用) 当前正在生成的特定页面
  targetPage: Annotation<any>(),

  // 输出：生成的代码结果
  // 使用 Path-Based Reducer 进行去重合并
  // 如果两个结果 path 相同，后面的覆盖前面的
  pagesCode: Annotation<any[]>({
    reducer: (existing, newResult) => {
      const merged = new Map(existing.map((item) => [item.path, item]));
      newResult.forEach((item) => merged.set(item.path, item));
      return Array.from(merged.values());
    },
    default: () => [],
  }),
});

// 2. 节点逻辑：单个页面生成器 (Worker Node)
const generatePageNode = async (state: typeof PageState.State) => {
  const { targetPage, context } = state;
  const { hooks, componentResult, types, analysis, intent, ui, existingFiles } = context;

  if (!targetPage) {
    console.warn("[PageGraph] No target page provided.");
    return {};
  }

  const filePath = targetPage.path;
  console.log(`[PageGraph] Generating: ${filePath}...`);

  // --- Context Assembly (复用优化后的逻辑) ---
  const componentsContext = (componentResult || [])
    .map((c: any) => {
      const name = c.sourceCorrelation || c.path.split("/").pop()?.replace(".tsx", "") || "Unknown";
      const code = c.content || c.code || "// No content";
      return `// Component Name: ${name}\n// File: ${c.path}\n${code}`;
    })
    .join("\n\n");

  const hooksContext = (hooks?.files || [])
    .map((h: any) => {
      const name = h.sourceCorrelation || h.path.split("/").pop()?.replace(".ts", "") || "Unknown";
      const code = h.content || h.code || "// No content";
      return `// Hook Name: ${name}\n// File: ${h.path}\n${code}`;
    })
    .join("\n\n");

  const existingFileContext = existingFiles?.[filePath]
    ? `【Current Page File】\n// File: ${filePath}\n${existingFiles[filePath]}`
    : "【Current Page File】\n该页面当前不存在，可以按需求新建。";
  const constrainedVisualMode =
    /截图复刻|按图还原|高保真还原|搜索首页|品牌首页|单页还原|svg|SVG|矢量|头像|轮廓|描摹|logo/.test(
      [analysis?.summary, analysis?.designAnalysis].filter(Boolean).join("\n"),
    );

  // 组装 User Input
  const userInput = {
    path: targetPage.path,
    description: targetPage.description,
    context: {
      generationMode: constrainedVisualMode ? "visually-constrained" : "standard",
      analysis: analysis
        ? {
            summary: analysis.summary,
            designAnalysis: analysis.designAnalysis,
            tags: analysis.tags,
          }
        : null,
      intent: intent
        ? {
            product: intent.product?.name,
            primaryScenario: intent.product?.primaryScenario,
            category: intent.category,
          }
        : null,
      uiPages: ui?.pages || [],
      instruction: "请参考以下【代码库】中的组件接口(Props)和Hook定义来组装页面。",
      // 注入详细代码库
      library: `
【Available Hooks Code (Data Layer)】
${hooksContext}

【Available Components Code (UI Layer)】
${componentsContext}

${existingFileContext}
`,
      // 索引表
      availableComponents: (componentResult || []).map((c: any) => ({
        name: c.sourceCorrelation || c.path.split("/").pop()?.replace(".tsx", "") || "Unknown",
        path: c.path,
      })),
      availableHooks: (hooks?.files || []).map((h: any) => ({
        name: h.sourceCorrelation || h.path.split("/").pop()?.replace(".ts", "") || "Unknown",
        path: h.path,
      })),
    },
  };

  // --- Model Call ---
  const model = getStructuredModel(PageGenSchema);
  let finalResult;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      if (attempt > 1)
        console.log(`[PageGraph] Retry generating ${filePath} (Attempt ${attempt})...`);

      finalResult = await model.invoke([
        { role: "system", content: PAGE_GEN_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(userInput, null, 2) },
      ]);
      break;
    } catch (e) {
      console.warn(`[PageGraph] Error generating ${filePath}:`, e);
      lastError = e;
    }
  }

  if (!finalResult) {
    throw new Error(`Failed to generate page ${filePath} after 3 attempts: ${lastError}`);
  }

  // 后处理 Step 1：修复 LLM 输出中可能存在的转义字符问题
  const normalizedResult = normalizeLLMResult(finalResult);

  // 后处理 Step 2：AST 分析修复（对象渲染、安全访问等）
  if (normalizedResult.content) {
    normalizedResult.content = processGeneratedCode(
      normalizedResult.content,
      filePath,
      types?.files || [],
    );
  }

  return {
    pagesCode: [normalizedResult],
  };
};

// 3. Map 分发逻辑 (Distributor)
const mapPages = (state: typeof PageState.State) => {
  const files = state.pagesToGenerate || [];

  // 去重输入源
  const uniqueFiles = Array.from(new Map(files.map((f) => [f.path, f])).values());

  console.log(
    `[PageGraph] Scheduling ${uniqueFiles.length} page generations (deduplicated from ${files.length})...`,
  );

  return uniqueFiles.map(
    (file: any) =>
      new Send("generatePage", {
        targetPage: file,
        context: state.context, // 透传上下文
      }),
  );
};

// 4. 构建并编译子图
export const pageGraph = new StateGraph(PageState)
  .addNode("generatePage", generatePageNode)
  .addConditionalEdges(START, mapPages, ["generatePage"])
  .addEdge("generatePage", END)
  .compile();
