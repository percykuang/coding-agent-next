import { StateGraph, Annotation, Send, END, START } from "@langchain/langgraph";
import { CompGenSchema } from "../flows/traditional/code-generation/schemas/compGenSchema.js";
import { COMP_GEN_SYSTEM_PROMPT } from "../flows/traditional/code-generation/prompts/compGenPrompts.js";
import { getStructuredModel } from "../utils/model.js";
import { normalizeLLMResult } from "../utils/codeNormalizer.js";
import { processGeneratedCode } from "../utils/ast/fixer.js";

// 1. 定义子图状态 (Subgraph State)
// 这是子图中流转的最小数据集
export const ComponentState = Annotation.Root({
  // 输入：所有需要生成的组件列表
  componentsToGenerate: Annotation<any[]>(),

  // 上下文：生成所需的依赖 (Hooks, Types, Services, Specs)
  context: Annotation<{
    hooks: any;
    types: any;
    service: any;
    components: any;
    analysis?: any;
    intent?: any;
    ui?: any;
    existingFiles?: Record<string, string>;
  }>(),

  // (Map步骤用) 当前正在生成的特定组件
  targetComponent: Annotation<any>(),

  // 输出：生成的代码结果
  // 使用 Path-Based Reducer 进行去重合并
  // 如果两个结果 path 相同，后面的覆盖前面的
  componentsCode: Annotation<any[]>({
    reducer: (existing, newResult) => {
      const merged = new Map(existing.map((item) => [item.path, item]));
      newResult.forEach((item) => merged.set(item.path, item));
      return Array.from(merged.values());
    },
    default: () => [],
  }),
});

// 2. 节点逻辑：单个组件生成器 (Worker Node)
const generateComponentNode = async (state: typeof ComponentState.State) => {
  const { targetComponent, context } = state;
  const { hooks, types, service, components, analysis, intent, ui, existingFiles } = context;

  if (!targetComponent) {
    console.warn("[ComponentGraph] No target component provided.");
    return {};
  }

  const filePath = targetComponent.path;
  const fileName = filePath.split("/").pop();
  console.log(`[ComponentGraph] Generating: ${fileName}...`);

  // --- Context Assembly (复用原逻辑) ---
  const typeContext = (types?.files || [])
    .map((f: any) => `// File: ${f.path}\n${f.code}`)
    .join("\n\n");

  const hooksContext = (hooks?.files || [])
    .map((f: any) => `// File: ${f.path}\n${f.content}`)
    .join("\n\n");

  const serviceContext = (service?.files || [])
    .map((f: any) => `// File: ${f.path}\n${f.content}`)
    .join("\n\n");

  const existingFileContext = existingFiles?.[filePath]
    ? `【当前文件现状】\n// File: ${filePath}\n${existingFiles[filePath]}`
    : "【当前文件现状】\n该文件当前不存在，可以按需求新建。";
  const constrainedVisualMode =
    /截图复刻|按图还原|高保真还原|搜索首页|品牌首页|单页还原|svg|SVG|矢量|头像|轮廓|描摹|logo/.test(
      [analysis?.summary, analysis?.designAnalysis].filter(Boolean).join("\n"),
    );
  const analysisContext = analysis
    ? JSON.stringify(
        {
          summary: analysis.summary,
          designAnalysis: analysis.designAnalysis,
          tags: analysis.tags,
        },
        null,
        2,
      )
    : "暂无分析上下文";
  const intentContext = intent
    ? JSON.stringify(
        {
          product: intent.product?.name,
          primaryScenario: intent.product?.primaryScenario,
          category: intent.category,
        },
        null,
        2,
      )
    : "暂无意图上下文";
  const uiContext = ui?.pages ? JSON.stringify(ui.pages, null, 2) : "暂无页面 UI 上下文";

  // Specs Match
  const compSpec = components?.components?.find(
    (c: any) => fileName.includes(c.id) || targetComponent.description?.includes(c.id),
  ) || {
    id: "Unknown",
    props: [],
    events: [],
    description: targetComponent.description,
  };

  // --- Model Call ---
  // 这里暂时为了简洁，未包含 Mock 逻辑，直接调用模型
  // 因为子图通常处理真实生成任务。如果需要 Mock，可以在外层拦截。

  const model = getStructuredModel(CompGenSchema);
  let finalResult;
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const userPrompt = `
当前任务: 生成组件文件 "${filePath}"

【组件规格 (Component Spec)】
ID: ${compSpec.id}
Description: ${compSpec.description || targetComponent.description}
Props: ${JSON.stringify(compSpec.props || [])}
Events: ${JSON.stringify(compSpec.events || [])}

【需求分析上下文】
${analysisContext}

【意图上下文】
${intentContext}

【页面 UI 上下文】
${uiContext}

【可用 Hooks (Data Logic - HOOKS FIRST)】
(请优先查找并使用以下 Hook 获取数据，禁止 Mock)
${hooksContext}

【可用类型 (Types)】
${typeContext}

【可用服务 (Services - Fallback Only)】
${serviceContext}

${existingFileContext}

【生成要求】
- 必须是完整的 React 组件代码。
- 使用 Tailwind CSS 样式。
- 必须使用相对路径引用 Types 和 Hooks (e.g. '../hooks/useNovels')。
- 严禁 Mock 数据。
- 如果当前文件已存在，请在保留既有职责的前提下改写，而不是完全无关地重写。
- ${constrainedVisualMode ? "当前是受视觉约束的生成模式：组件文案、品牌、导航项、按钮名称、SVG 图形语义都必须优先服从视觉分析。禁止臆造“书架”“排行榜”“分类”、iconId 查询器、图标库等截图或需求中不存在的结构。" : "当前是常规模式：可根据组件职责做合理抽象。"}
`;

      finalResult = await model.invoke([
        { role: "system", content: COMP_GEN_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ]);
      break;
    } catch (e) {
      console.warn(`[ComponentGraph] Retry ${fileName} (${attempt}/3):`, e);
      lastError = e;
    }
  }

  if (!finalResult) {
    throw new Error(`Failed to generate component ${fileName}: ${lastError}`);
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
  if (fileName === "TopNavigation.tsx") {
    const preview = normalizedResult.content?.slice(0, 300).replace(/\s+/g, " ") || "";
    console.log(`[ComponentGraph] Preview ${fileName}: ${preview}`);
  }

  return {
    componentsCode: [normalizedResult],
  };
};

// 3. Map 分发逻辑 (Distributor)
const mapComponents = (state: typeof ComponentState.State) => {
  const files = state.componentsToGenerate || [];

  // 去重输入源 (Input Cleanup)
  // 使用 Map 确保每个 path 只有一个任务
  const uniqueFiles = Array.from(new Map(files.map((f) => [f.path, f])).values());

  console.log(
    `[ComponentGraph] Scheduling ${uniqueFiles.length} generations (deduplicated form ${files.length})...`,
  );

  return uniqueFiles.map(
    (file: any) =>
      new Send("generateComponent", {
        targetComponent: file,
        context: state.context, // 透传上下文
      }),
  );
};

// 4. 构建并编译子图
export const componentGraph = new StateGraph(ComponentState)
  .addNode("generateComponent", generateComponentNode)
  .addConditionalEdges(START, mapComponents, ["generateComponent"])
  .addEdge("generateComponent", END)
  .compile();
