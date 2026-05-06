/**
 * Figma 直连流程图
 *
 * 完整 9 节点管线:
 *   Figma URL
 *     → [figmaInputNode]      调用 MCP Server 获取生成代码
 *     → [imageDownloadNode]   下载图片并上传到 OSS，替换临时链接
 *     → [astParserNode]       Babel AST 解析代码结构（确定性）
 *     → [blockExtractNode]    提取布局坐标信息（确定性）
 *     → [geometryGroupNode]   Y 轴几何聚类分组（确定性）
 *     → [sectionNamingNode]   AI 语义命名（轻量级 AI）
 *     → [componentGenNode]    AI 组件代码生成（并行 AI）
 *     → [assemblyNode]        组装 Sandpack 格式（确定性）
 *     → [figmaPostProcessNode] AST 后处理（确定性）
 *     → END
 *
 * 与 Traditional 流程的区别:
 *   Traditional: prompt → 多步骤 AI 分析 → 逐个生成代码 → 组装
 *   Figma:       URL → MCP 一次性生成代码 → 图片OSS化 → AST解析 → 布局提取 → 几何聚类 → AI命名 → AI生成 → 组装
 */

import { StateGraph, START, END, MemorySaver, Annotation } from "@langchain/langgraph";

// ===== Input Phase Nodes =====
import { figmaInputNode } from "../flows/figma-direct/input/nodes/figmaInputNode.js";
import { imageDownloadNode } from "../flows/figma-direct/input/nodes/imageDownloadNode.js";

// ===== Parsing Phase Nodes (确定性) =====
import { astParserNode } from "../flows/figma-direct/parsing/nodes/astParserNode.js";
import { blockExtractNode } from "../flows/figma-direct/parsing/nodes/blockExtractNode.js";
import { geometryGroupNode } from "../flows/figma-direct/parsing/nodes/geometryGroupNode.js";

// ===== Refactoring Phase Nodes (AI) =====
import { sectionNamingNode } from "../flows/figma-direct/refactoring/nodes/sectionNamingNode.js";
import { componentGenNode } from "../flows/figma-direct/refactoring/nodes/componentGenNode.js";

// ===== Assembly Phase Node (确定性) =====
import { assemblyNode } from "../flows/figma-direct/assembly/nodes/assemblyNode.js";
import { figmaPostProcessNode } from "../flows/figma-direct/assembly/nodes/figmaPostProcessNode.js";

// ===== Types =====
import type {
  AstParserOutput,
  BlockExtractOutput,
  GeometryGroupOutput,
} from "../flows/figma-direct/parsing/schemas/parsingSchema.js";
import type {
  T_SectionNamingOutput,
  T_GeneratedFile,
} from "../flows/figma-direct/refactoring/schemas/refactoringSchema.js";

const checkpointer = new MemorySaver();

// ==================== Figma 图 State 定义 ====================

const FigmaGraphState = Annotation.Root({
  // ---------- 通用输入 ----------

  /** 聊天历史记录，用于保留用户上下文与对话内容 */
  messages: Annotation<any[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),

  /** Figma 设计稿 URL，作为整个 Figma 流程的主输入 */
  figmaUrl: Annotation<string>(),

  /** 用户补充的文字描述，可用于辅助后续生成 */
  textPrompt: Annotation<string | undefined>(),

  // ---------- 输入阶段（Input）----------

  /** MCP Server 生成的原始前端代码字符串 */
  rawCode: Annotation<string | undefined>(),

  /** 原始代码的字符数，用于统计和日志输出 */
  codeLength: Annotation<number | undefined>(),

  /** 原始代码的总行数，用于统计和日志输出 */
  lineCount: Annotation<number | undefined>(),

  /** MCP 返回代码的语言类型，如 typescript 或 tsx */
  language: Annotation<string | undefined>(),

  // ---------- 解析阶段（Parsing）----------

  /** AST 解析结果，包含入口组件、顶层 JSX、全局资源和辅助组件 */
  astParserResult: Annotation<AstParserOutput | undefined>(),

  /** 布局块提取结果，包含带坐标的区块列表和页面高度 */
  blockExtractResult: Annotation<BlockExtractOutput | undefined>(),

  /** 几何聚类结果，表示按空间位置切分后的 Section 列表 */
  geometryGroupResult: Annotation<GeometryGroupOutput | undefined>(),

  // ---------- 重构阶段（Refactoring）----------

  /** Section 命名结果，记录每个分区的语义化组件名称 */
  sectionNamingResult: Annotation<T_SectionNamingOutput | undefined>(),

  /** AI 生成的组件文件列表，每个 Section 对应一个组件文件 */
  generatedFiles: Annotation<T_GeneratedFile[] | undefined>(),

  // ---------- 生成阶段（Assembly / Output）----------

  /** 最终产出的 Sandpack 文件集合，包含文件内容及统计信息 */
  files: Annotation<
    | {
        files: Record<string, string>;
        stats?: { totalFiles: number; categories: Record<string, number> };
      }
    | undefined
  >(),
});

// ==================== 构建 Figma 图 ====================

export function buildFigmaAgent() {
  const builder = new StateGraph(FigmaGraphState)

    // ===== 注册节点 =====

    // Input Phase (获取代码 + 图片处理)
    .addNode("figmaInputNode", figmaInputNode)
    .addNode("imageDownloadNode", imageDownloadNode)

    // Parsing Phase (确定性，无 AI)
    .addNode("astParserNode", astParserNode)
    .addNode("blockExtractNode", blockExtractNode)
    .addNode("geometryGroupNode", geometryGroupNode)

    // Refactoring Phase (AI)
    .addNode("sectionNamingNode", sectionNamingNode)
    .addNode("componentGenNode", componentGenNode)

    // Assembly Phase (确定性，无 AI)
    .addNode("assemblyNode", assemblyNode)
    .addNode("figmaPostProcessNode", figmaPostProcessNode)

    // ===== 编排流程 =====

    .addEdge(START, "figmaInputNode")
    .addEdge("figmaInputNode", "imageDownloadNode")
    .addEdge("imageDownloadNode", "astParserNode")
    .addEdge("astParserNode", "blockExtractNode")
    .addEdge("blockExtractNode", "geometryGroupNode")
    .addEdge("geometryGroupNode", "sectionNamingNode")
    .addEdge("sectionNamingNode", "componentGenNode")
    .addEdge("componentGenNode", "assemblyNode")
    .addEdge("assemblyNode", "figmaPostProcessNode")
    .addEdge("figmaPostProcessNode", END);

  return builder.compile({
    checkpointer,
  });
}
