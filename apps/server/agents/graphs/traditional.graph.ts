import type { T_Graph } from "../shared/schemas/graphSchema.js";
import { StateGraph, START, END, MemorySaver, Annotation } from "@langchain/langgraph";

// Input Processing Phase
import { intentNode } from "../flows/traditional/input-processing/nodes/intentNode.js";

// Analysis Phase
import { analysisNode } from "../flows/traditional/analysis/nodes/analysisNode.js";
import { capabilityNode } from "../flows/traditional/analysis/nodes/capabilityNode.js";
import { uiNode } from "../flows/traditional/analysis/nodes/uiNode.js";
import { componentNode } from "../flows/traditional/analysis/nodes/componentNode.js";

// Architecture Phase
import { structureNode } from "../flows/traditional/architecture/nodes/structureNode.js";
import { dependencyNode } from "../flows/traditional/architecture/nodes/dependencyNode.js";
import { typeNode } from "../flows/traditional/architecture/nodes/typeNode.js";
import { layoutNode } from "../flows/traditional/architecture/nodes/layoutNode.js";

// Code Generation Phase
import { utilsNode } from "../flows/traditional/code-generation/nodes/utilsNode.js";
import { mockDataNode } from "../flows/traditional/code-generation/nodes/mockDataNode.js";
import { serviceNode } from "../flows/traditional/code-generation/nodes/serviceNode.js";
import { hooksNode } from "../flows/traditional/code-generation/nodes/hooksNode.js";
import { styleGenNode } from "../flows/traditional/code-generation/nodes/styleGenNode.js";

// Assembly Phase
import { appGenNode } from "../flows/traditional/assembly/nodes/appGenNode.js";
import { assembleNode } from "../flows/traditional/assembly/nodes/assembleNode.js";
import { postProcessNode } from "../flows/traditional/assembly/nodes/postProcessNode.js";

// Subgraphs
import { componentGraph } from "./component.graph.js";
import { pageGraph } from "./page.graph.js";

// Mock utilities
import { tryExecuteMock } from "../utils/mock.js";

const checkpointer = new MemorySaver();

// 使用 Annotation.Root 显式定义状态
// 这解决了 LangGraph JS 在 StateGraph(ZodSchema) 模式下 Reducer 不生效的问题
const GraphState = Annotation.Root({
  // 基础字段 (LastValue 模式 - 默认)
  messages: Annotation<T_Graph["messages"]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  existingFiles: Annotation<T_Graph["existingFiles"]>(),
  mockConfig: Annotation<T_Graph["mockConfig"]>(),
  textPrompt: Annotation<T_Graph["textPrompt"]>(),
  analysis: Annotation<T_Graph["analysis"]>(),

  // Step 0.5: 控制流标记
  skipGeneration: Annotation<T_Graph["skipGeneration"]>(),

  intent: Annotation<T_Graph["intent"]>(),
  capabilities: Annotation<T_Graph["capabilities"]>(),
  ui: Annotation<T_Graph["ui"]>(),
  components: Annotation<T_Graph["components"]>(),
  structure: Annotation<T_Graph["structure"]>(),
  dependency: Annotation<T_Graph["dependency"]>(),
  types: Annotation<T_Graph["types"]>(),
  utils: Annotation<T_Graph["utils"]>(),
  mockData: Annotation<T_Graph["mockData"]>(),
  service: Annotation<T_Graph["service"]>(),
  hooks: Annotation<T_Graph["hooks"]>(),

  // 最终代码产物
  // 当前仅由 componentSubgraph / pageSubgraph 单点写入：
  // 子图内部已完成并发聚合，主图不再重复 reducer 合并。
  componentsCode: Annotation<T_Graph["componentsCode"]>(),
  pagesCode: Annotation<T_Graph["pagesCode"]>(),

  // Step 14: Layout 组件
  layouts: Annotation<T_Graph["layouts"]>(),

  // Step 15: 全局样式
  styles: Annotation<T_Graph["styles"]>(),

  // Step 15: App.tsx 入口文件
  app: Annotation<T_Graph["app"]>(),

  // Step 16-17: 组装后的文件与 AST 后处理结果 (Sandpack 格式)
  files: Annotation<T_Graph["files"]>(),
});

// --- Bridge Nodes (代理节点) ---
// 这些节点负责：
// 1. 从主图 State 中提取子图需要的 Input
// 2. 调用子图
// 3. 返回子图的 Output，供主图 reducer 合并

const runComponentGraph = async (state: typeof GraphState.State) => {
  // Mock 模式检查
  const mockResult = await tryExecuteMock(
    state,
    "componentSubgraph",
    "compGenResult.json",
    (data) => ({ componentsCode: data.componentsCode || data }),
  );
  if (mockResult) return mockResult;

  const allFiles = state.structure?.files || [];
  const componentsToGenerate = allFiles.filter(
    (f: any) =>
      f.path.includes("/components/") && (f.path.endsWith(".tsx") || f.path.endsWith(".jsx")),
  );

  console.log(
    `[MainGraph] Invoking Component Subgraph for ${componentsToGenerate.length} items...`,
  );

  // 1. 构造子图输入
  const subgraphInput = {
    componentsToGenerate,
    context: {
      hooks: state.hooks,
      types: state.types,
      service: state.service,
      components: state.components,
      analysis: state.analysis,
      intent: state.intent,
      ui: state.ui,
      existingFiles: state.existingFiles,
    },
  };

  // 2. 调用子图 (作为一个整体运行直到结束)
  const result = await componentGraph.invoke(subgraphInput);

  // 3. 返回结果 (将被合并到主图 state.componentsCode)
  return {
    componentsCode: result.componentsCode,
  };
};

const runPageGraph = async (state: typeof GraphState.State) => {
  // Mock 模式检查
  const mockResult = await tryExecuteMock(state, "pageSubgraph", "pageGenResult.json", (data) => ({
    pagesCode: Array.isArray(data) ? data : data.pagesCode || data,
  }));
  if (mockResult) return mockResult;

  const allFiles = state.structure?.files || [];
  const pagesToGenerate = allFiles.filter(
    (f: any) => f.path.includes("/pages/") && (f.path.endsWith(".tsx") || f.path.endsWith(".jsx")),
  );

  console.log(`[MainGraph] Invoking Page Subgraph for ${pagesToGenerate.length} items...`);

  const subgraphInput = {
    pagesToGenerate,
    context: {
      hooks: state.hooks,
      componentResult: state.componentsCode || [], // 此时已经是最新的组件代码，确保不为 undefined
      types: state.types, // 类型定义（供 AST 后处理使用）
      analysis: state.analysis,
      intent: state.intent,
      ui: state.ui,
      existingFiles: state.existingFiles,
    },
  };

  const result = await pageGraph.invoke(subgraphInput);

  return {
    pagesCode: result.pagesCode,
  };
};

export function buildTraditionalAgent() {
  const builder = new StateGraph(GraphState)
    // Step 0: 分析节点
    .addNode("analysisNode", analysisNode)
    // Step 1-11: 核心规划节点
    .addNode("intentNode", intentNode)
    .addNode("capabilityNode", capabilityNode)
    .addNode("uiNode", uiNode)
    .addNode("componentNode", componentNode)
    .addNode("structureNode", structureNode)
    .addNode("dependencyNode", dependencyNode)
    .addNode("typeNode", typeNode)
    .addNode("utilsNode", utilsNode)
    .addNode("mockDataNode", mockDataNode)
    .addNode("serviceNode", serviceNode)
    .addNode("hooksNode", hooksNode)
    // Step 12-13: 子图代理节点
    .addNode("componentSubgraph", runComponentGraph)
    .addNode("pageSubgraph", runPageGraph)
    // Step 14: Layout 生成节点
    .addNode("layoutNode", layoutNode)
    // Step 15: 样式生成节点
    .addNode("styleGenNode", styleGenNode)
    // Step 15: App.tsx 生成节点
    .addNode("appGenNode", appGenNode)
    // Step 16: 文件组装节点
    .addNode("assembleNode", assembleNode)
    // Step 17: AST 后处理节点
    .addNode("postProcessNode", postProcessNode)

    // 编排流程
    .addEdge(START, "analysisNode")
    .addEdge("analysisNode", "intentNode")
    .addEdge("intentNode", "capabilityNode")
    .addEdge("capabilityNode", "uiNode")
    .addEdge("uiNode", "componentNode")
    .addEdge("componentNode", "structureNode")
    .addEdge("structureNode", "dependencyNode")
    .addEdge("dependencyNode", "typeNode")
    .addEdge("typeNode", "utilsNode")
    .addEdge("utilsNode", "mockDataNode")
    .addEdge("mockDataNode", "serviceNode")
    .addEdge("serviceNode", "hooksNode")
    .addEdge("hooksNode", "componentSubgraph")
    .addEdge("componentSubgraph", "pageSubgraph")
    .addEdge("pageSubgraph", "layoutNode")
    .addEdge("layoutNode", "styleGenNode")
    .addEdge("styleGenNode", "appGenNode")
    .addEdge("appGenNode", "assembleNode")
    .addEdge("assembleNode", "postProcessNode")
    .addEdge("postProcessNode", END);

  return builder.compile({
    checkpointer,
  });
}
