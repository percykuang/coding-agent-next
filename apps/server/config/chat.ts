// 节点名称到 SSE 事件类型及输出字段 Key 的映射配置
// Key: nodeName (LangGraph 中定义的节点名称)
// Value.type: eventType (前端 SSE 监听的事件名)
// Value.key: outputKey (节点返回的 State 中的字段名)

export const NODE_HANDLERS: Record<string, { type: string; key: string }> = {
  // ==================== Traditional 流程节点 ====================
  analysisNode: { type: "analysis", key: "analysis" },
  intentNode: { type: "intent", key: "intent" },
  capabilityNode: { type: "capabilities", key: "capabilities" },
  uiNode: { type: "ui", key: "ui" },
  componentNode: { type: "components", key: "components" },
  structureNode: { type: "structure", key: "structure" },
  dependencyNode: { type: "dependency", key: "dependency" },
  typeNode: { type: "types", key: "types" },
  utilsNode: { type: "utils", key: "utils" },
  mockDataNode: { type: "mockData", key: "mockData" },
  // 注意：serviceNode 的输出字段在 Graph Schema 中被定义为 'logic'
  serviceNode: { type: "service", key: "logic" },
  hooksNode: { type: "hooks", key: "hooks" },
  componentSubgraph: { type: "componentsCode", key: "componentsCode" },
  pageSubgraph: { type: "pagesCode", key: "pagesCode" },
  layoutNode: { type: "layouts", key: "layouts" },
  styleGenNode: { type: "styles", key: "styles" },
  appGenNode: { type: "app", key: "app" },
  assembleNode: { type: "files", key: "files" },
  postProcessNode: { type: "files", key: "files" },

  // ==================== Figma 直连流程节点 ====================
  // Step 1: Input (MCP 获取代码)
  figmaInputNode: { type: "figmaRawCode", key: "rawCode" },
  // Step 2: Input (图片下载 & OSS 上传)
  imageDownloadNode: { type: "figmaImageProcessed", key: "rawCode" },
  // Step 3: Parsing (确定性 - AST)
  astParserNode: { type: "figmaAstParsed", key: "astParserResult" },
  // Step 4: Parsing (确定性 - 布局提取)
  blockExtractNode: { type: "figmaBlockExtract", key: "blockExtractResult" },
  // Step 5: Parsing (确定性 - 几何聚类)
  geometryGroupNode: { type: "figmaGeometryGroup", key: "geometryGroupResult" },
  // Step 6: Refactoring (AI - 命名)
  sectionNamingNode: { type: "figmaSectionNaming", key: "sectionNamingResult" },
  // Step 7: Refactoring (AI - 组件生成)
  componentGenNode: { type: "figmaComponentGen", key: "generatedFiles" },
  // Step 8: Assembly (确定性 - 组装，使用独立事件类型)
  assemblyNode: { type: "figmaAssembly", key: "files" },
  figmaPostProcessNode: { type: "figmaAssembly", key: "files" },
};
