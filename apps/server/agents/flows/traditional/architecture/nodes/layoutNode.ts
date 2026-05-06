import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { LayoutNodeOutputSchema } from "../schemas/layoutSchema.js";
import { LAYOUT_GEN_SYSTEM_PROMPT } from "../prompts/layoutPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { normalizeLLMResult } from "../../../../utils/codeNormalizer.js";
import { withRetry } from "../../../../utils/retry.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

function isScreenshotReplicaMode(state: T_Graph) {
  const text = [state.analysis?.summary, state.analysis?.designAnalysis].filter(Boolean).join("\n");

  return /截图复刻|按图还原|高保真还原|搜索首页|品牌首页|单页还原|svg|SVG|矢量|头像|轮廓|描摹|logo/.test(
    text,
  );
}

/**
 * Step 14.5: Layout 组件生成节点
 *
 * 分析页面间的共享 UI 结构，生成可复用的 Layout 组件。
 * 输出 Layout 代码和路由嵌套结构映射。
 */
export async function layoutNode(state: T_Graph) {
  // 1. MOCK MODE Logic (优先处理)
  const mockResult = await tryExecuteMock(state, "layoutNode", "layoutResult.json", (result) => {
    console.log(`--- LayoutNode Loaded Mock Data ---`);
    return {
      layouts: result,
    };
  });
  if (mockResult) return mockResult;

  console.log(`--- LayoutNode HEAD Start ---`);

  // 2. 准备上下文数据

  // 2.1 页面列表 (从 pagesCode 获取已生成的页面)
  const pagesCode = state.pagesCode || [];
  const pages = pagesCode.map((p) => {
    // 从路径中提取组件名，如 /pages/NovelList.tsx -> NovelList
    const match = p.path.match(/\/pages\/([^.]+)\.tsx$/);
    const name = match ? match[1] : "Unknown";
    return {
      name,
      description: p.description || "",
    };
  });

  // 2.2 UI 分析结果 (从 ui 节点获取)
  const uiSpec = state.ui;
  const sharedElements: string[] = [];
  const layoutPatterns: string[] = [];

  // 从 UI 分析的页面结构中推断共享元素
  if (uiSpec?.pages) {
    // 检查是否有使用 dashboard-shell 布局的页面（通常有 sidebar）
    const hasDashboardShell = uiSpec.pages.some((p) => p.layout === "dashboard-shell");
    if (hasDashboardShell) {
      sharedElements.push("侧边栏/Sidebar");
    }

    // 检查是否有使用 default 布局的页面（通常有 header/footer）
    const hasDefaultLayout = uiSpec.pages.some((p) => p.layout === "default");
    if (hasDefaultLayout) {
      sharedElements.push("顶部导航栏/Header");
      sharedElements.push("页脚/Footer");
    }

    // 检查是否有 blank 或 editor-shell 布局（沉浸式）
    const hasBlankLayout = uiSpec.pages.some(
      (p) => p.layout === "blank" || p.layout === "editor-shell",
    );
    if (hasBlankLayout) {
      layoutPatterns.push("存在沉浸式/全屏页面，可能需要独立布局");
    }
  }

  // 从页面描述中推断布局模式
  const pageDescriptions = pages.map((p) => p.description).join(" ");
  if (
    pageDescriptions.includes("仪表板") ||
    pageDescriptions.includes("列表") ||
    pageDescriptions.includes("详情")
  ) {
    layoutPatterns.push("大多数页面有统一的顶部导航和页脚");
  }
  if (
    pageDescriptions.includes("阅读") ||
    pageDescriptions.includes("沉浸") ||
    pageDescriptions.includes("全屏")
  ) {
    layoutPatterns.push("存在沉浸式/全屏页面，可能需要独立布局");
  }
  if (
    pageDescriptions.includes("登录") ||
    pageDescriptions.includes("注册") ||
    pageDescriptions.includes("认证")
  ) {
    layoutPatterns.push("存在认证页面，可能需要简化布局");
  }

  // 2.3 可用组件列表 (用于 Layout 可能复用的组件)
  const componentsCode = state.componentsCode || [];
  const availableComponents = componentsCode.map((c) => {
    const match = c.path.match(/\/components\/([^.]+)\.tsx$/);
    return match ? match[1] : "Unknown";
  });
  const screenshotReplicaMode = isScreenshotReplicaMode(state);
  const analysisSummary = state.analysis?.summary || "暂无摘要";
  const designAnalysis = state.analysis?.designAnalysis || "暂无视觉分析";
  const intentSummary = state.intent
    ? JSON.stringify(
        {
          product: state.intent.product?.name,
          primaryScenario: state.intent.product?.primaryScenario,
          category: state.intent.category,
        },
        null,
        2,
      )
    : "暂无意图详情";

  // 3. 构建 User Prompt
  const userPrompt = `
【任务】
分析页面间的共享 UI 结构，生成可复用的 Layout 组件。

【分析摘要】
${analysisSummary}

【视觉分析】
${designAnalysis}

【意图摘要】
${intentSummary}

【页面列表 (共 ${pages.length} 个页面)】
${JSON.stringify(pages, null, 2)}

【UI 分析结果】
${JSON.stringify(
  {
    sharedElements:
      sharedElements.length > 0 ? sharedElements : ["暂无明确的共享元素信息，请根据页面描述推断"],
    layoutPatterns: layoutPatterns.length > 0 ? layoutPatterns : ["请根据页面描述推断布局模式"],
  },
  null,
  2,
)}

【可用组件】
${availableComponents.length > 0 ? availableComponents.join(", ") : "暂无可复用组件"}

【生成模式】
${screenshotReplicaMode ? "截图复刻模式：请高保真保持原始页面语义，禁止发明新的产品类型、品牌名或导航栏目。" : "常规生成模式：可根据页面描述归纳合理的共享布局。"}

【要求】
1. 分析哪些页面共享相同的布局结构（Header、Sidebar、Footer）
2. 生成 1-3 个 Layout 组件（不要过度拆分）
3. 每个 Layout 必须使用 <Outlet /> 渲染子页面
4. 输出 routeStructure 映射，说明每个 Layout 包含哪些页面
5. 确保所有页面都被分配到某个 Layout
6. 如果是截图复刻单页，优先使用中性外壳，不要凭空补出小说站、内容社区、管理后台等共享壳层
`.trim();

  // 4. 调用 LLM
  const model = getStructuredModel(LayoutNodeOutputSchema);

  const messages = [new SystemMessage(LAYOUT_GEN_SYSTEM_PROMPT), new HumanMessage(userPrompt)];

  const response = await withRetry(model, messages, {
    maxRetries: 3,
    onRetry: (attempt, error) => {
      console.warn(`[LayoutNode] Retry attempt ${attempt} due to:`, error.message);
    },
  });

  // 后处理：修复 LLM 输出中可能存在的转义字符问题
  const normalizedResponse = normalizeLLMResult(response);

  console.log(
    `--- LayoutNode Generated ${normalizedResponse.layoutsCode?.length || 0} Layouts ---`,
  );
  normalizedResponse.layoutsCode?.forEach((layout: any) => {
    const preview = layout.content?.slice(0, 300).replace(/\s+/g, " ") || "";
    console.log(`[LayoutNode] Preview ${layout.path}: ${preview}`);
  });

  // 5. 返回结果
  return {
    layouts: normalizedResponse,
  };
}
