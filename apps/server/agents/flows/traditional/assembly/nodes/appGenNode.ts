import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { AppGenSchema } from "../schemas/appGenSchema.js";
import { APP_GEN_SYSTEM_PROMPT } from "../prompts/appGenPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { normalizeLLMResult } from "../../../../utils/codeNormalizer.js";
import { withRetry } from "../../../../utils/retry.js";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

/**
 * Step 15: App.tsx 生成节点
 *
 * 根据页面列表和依赖信息，生成应用入口文件 App.tsx。
 * 负责配置路由系统和必要的 Context Provider。
 */
export async function appGenNode(state: T_Graph) {
  // 1. MOCK MODE Logic (优先处理)
  const mockResult = await tryExecuteMock(state, "appGenNode", "appGenResult.json", (result) => {
    console.log(`--- AppGenNode Loaded Mock Data ---`);
    return { app: result };
  });
  if (mockResult) return mockResult;

  console.log(`--- AppGenNode HEAD Start ---`);

  // 2. 准备上下文数据

  // 2.1 页面列表 (从 UI Spec 获取)
  const uiSpec = state.ui;
  const pages = uiSpec?.pages || [];
  const pagesContext = pages
    .map((p) => {
      // 转换动态路由格式：[id] -> :id
      const reactRouterPath = p.route.replace(/\[([^\]]+)\]/g, ":$1");
      return `- ${p.pageId}: ${reactRouterPath}`;
    })
    .join("\n");

  // 2.2 依赖信息 (用于判断需要哪些 Provider)
  const fullDependencies = state.dependency?.packageJson?.dependencies || {};
  const dependencyList = Object.keys(fullDependencies);

  // 检测需要 Provider 的依赖
  const providerHints: string[] = [];
  if (dependencyList.includes("react-query") || dependencyList.includes("@tanstack/react-query")) {
    providerHints.push("- react-query: 需要 QueryClientProvider");
  }
  if (dependencyList.includes("next-themes")) {
    providerHints.push("- next-themes: 需要 ThemeProvider");
  }
  if (dependencyList.includes("react-hot-toast")) {
    providerHints.push("- react-hot-toast: 需要在 App 底部添加 <Toaster />");
  }
  if (dependencyList.includes("sonner")) {
    providerHints.push("- sonner: 需要在 App 底部添加 <Toaster /> (from sonner)");
  }

  const providerContext =
    providerHints.length > 0
      ? providerHints.join("\n")
      : "无需额外 Provider，直接使用 BrowserRouter 包裹即可";

  // 2.3 已生成的页面代码（用于确认页面组件名）
  const pagesCode = state.pagesCode || [];
  const pageImportsContext = pagesCode
    .map((p) => {
      // 从路径中提取组件名，如 /pages/NovelList.tsx -> NovelList
      const match = p.path.match(/\/pages\/([^.]+)\.tsx$/);
      const componentName = match ? match[1] : "Unknown";
      return `- ${componentName} (${p.path})`;
    })
    .join("\n");

  // 2.4 Layout 信息（用于嵌套路由配置）
  const layouts = state.layouts;
  const layoutsCode = layouts?.layoutsCode || [];
  const routeStructure = layouts?.routeStructure || {};

  const layoutImportsContext = layoutsCode
    .map((l) => {
      const match = l.path.match(/\/layouts\/([^.]+)\.tsx$/);
      const layoutName = match ? match[1] : "Unknown";
      return `- ${layoutName} (${l.path}): ${l.description}`;
    })
    .join("\n");

  const routeStructureContext = Object.entries(routeStructure)
    .map(([layoutName, pageNames]) => `- ${layoutName}: [${pageNames.join(", ")}]`)
    .join("\n");

  const existingAppContext = state.existingFiles?.["/App.tsx"]
    ? `
【现有 App.tsx】
${state.existingFiles["/App.tsx"]}
`
    : "";

  // 3. 构建 User Prompt
  const userPrompt = `
【任务】
生成应用入口文件 App.tsx，配置嵌套路由和 Provider。

【页面列表 (共 ${pages.length} 个页面)】
${pagesContext || "暂无页面信息"}

【已生成的页面组件】
${pageImportsContext || "暂无页面组件信息，请根据页面列表推断组件名"}

【Layout 组件列表】
${layoutImportsContext || "暂无 Layout 信息"}

【路由嵌套结构 (Layout -> Pages)】
${routeStructureContext || "暂无路由结构信息，请将所有页面放在 MainLayout 下"}

【依赖分析 - Provider 需求】
${providerContext}

【完整依赖列表】
${dependencyList.slice(0, 20).join(", ")}${dependencyList.length > 20 ? "..." : ""}

${existingAppContext}

【要求】
1. 使用 React Router v6 配置嵌套路由
2. 根据 routeStructure 将页面放入对应的 Layout 下
3. Layout 作为父路由（不需要 path），子页面嵌套在其中
4. 动态路由使用 :param 格式（已在页面列表中转换）
5. 根据依赖正确添加 Provider 包装
6. 代码精简，控制在 50-100 行

请生成符合 AppGenSchema 的 JSON 输出。
`;

  // 4. 调用 LLM 生成
  const model = getStructuredModel(AppGenSchema);

  try {
    const messages = [new SystemMessage(APP_GEN_SYSTEM_PROMPT), new HumanMessage(userPrompt)];

    const result = await withRetry(model, messages, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.warn(`[AppGenNode] Retry attempt ${attempt} due to:`, error.message);
      },
    });

    // 后处理：修复 LLM 输出中可能存在的转义字符问题
    const normalizedResult = normalizeLLMResult(result);

    console.log(`--- AppGenNode Generated: ${normalizedResult.path} ---`);
    console.log(`
==================================================
[AppGenNode] 🟢 Generated: ${normalizedResult.path}
==================================================
${normalizedResult.content}
==================================================
`);

    return {
      app: normalizedResult,
    };
  } catch (error) {
    console.error("AppGenNode Error:", error);
    throw new Error(`AppGenNode failed: ${error}`);
  }
}
