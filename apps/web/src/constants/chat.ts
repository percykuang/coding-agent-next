import { StreamEventType } from "@/types/api";
import type { FlowType, Phase, StepType } from "@/types/flow";
import type { FlowConfig, StepContent } from "@/types/config";

// ============================================================================
// 流程配置（Flow Configuration）
// ============================================================================

export const FLOW_CONFIG: Record<FlowType, FlowConfig> = {
  traditional: {
    name: "传统流程",
    description: "基于提示词的完整 AI 规划生成",
    initialStep: "analysis",
    phases: ["planning", "foundation", "logic", "view", "assembly"],
  },
  figma: {
    name: "Figma 直连",
    description: "基于 Figma 设计稿的快速生成",
    initialStep: "figmaRawCode",
    phases: ["figma-input", "figma-parsing", "figma-refactoring", "figma-assembly"],
  },
};

// ============================================================================
// 阶段配置（Phase Configuration）
// ============================================================================

/** 阶段元数据（统一配置） */
export const PHASE_INFO: Record<Phase, { title: string; order: number; flow: FlowType }> = {
  // Traditional 流程阶段
  planning: { title: "规划阶段", order: 1, flow: "traditional" },
  foundation: { title: "基础建设", order: 2, flow: "traditional" },
  logic: { title: "逻辑构建", order: 3, flow: "traditional" },
  view: { title: "视图构建", order: 4, flow: "traditional" },
  assembly: { title: "应用组装", order: 5, flow: "traditional" },
  // Figma 流程阶段
  "figma-input": { title: "输入阶段", order: 1, flow: "figma" },
  "figma-parsing": { title: "解析阶段", order: 2, flow: "figma" },
  "figma-refactoring": { title: "重构阶段", order: 3, flow: "figma" },
  "figma-assembly": { title: "组装阶段", order: 4, flow: "figma" },
};

// 为了向后兼容，保留 PhaseName 类型别名
export type PhaseName = Phase;

/** 阶段包含的步骤列表 */
export const PHASE_NODES: Record<Phase, StepType[]> = {
  // Traditional 流程
  planning: ["analysis", "intent", "capabilities", "ui", "components", "structure", "dependency"],
  foundation: ["types", "utils", "mockData"],
  logic: ["service", "hooks"],
  view: ["componentsCode", "pagesCode", "layouts", "styles"],
  assembly: ["app", "files"],
  // Figma 流程
  "figma-input": ["figmaRawCode", "figmaImageProcessed"],
  "figma-parsing": ["figmaAstParsed", "figmaBlockExtract", "figmaGeometryGroup"],
  "figma-refactoring": ["figmaSectionNaming", "figmaComponentGen"],
  "figma-assembly": ["figmaAssembly"],
};

/** 根据节点名称获取所属阶段（从 PHASE_NODES 反向计算） */
export function getPhaseByNode(nodeName: StreamEventType): Phase | undefined {
  for (const [phase, nodes] of Object.entries(PHASE_NODES)) {
    if (nodes.includes(nodeName as StepType)) {
      return phase as Phase;
    }
  }
  return undefined;
}

/** 根据步骤获取所属流程 */
export function getFlowByStep(stepName: StepType): FlowType | undefined {
  const phase = getPhaseByNode(stepName);
  return phase ? PHASE_INFO[phase].flow : undefined;
}

// ============================================================================
// 步骤流转配置（Next Step Map）
// ============================================================================

/** Traditional 流程步骤流转 */
export const TRADITIONAL_STEP_MAP: Record<string, StreamEventType> = {
  analysis: "intent",
  intent: "capabilities",
  capabilities: "ui",
  ui: "components",
  components: "structure",
  structure: "dependency",
  dependency: "types",
  types: "utils",
  utils: "mockData",
  mockData: "service",
  service: "hooks",
  hooks: "componentsCode",
  componentsCode: "pagesCode",
  pagesCode: "layouts",
  layouts: "styles",
  styles: "app",
  app: "files",
  files: "done",
};

/** Figma 流程步骤流转 */
export const FIGMA_STEP_MAP: Record<string, StreamEventType> = {
  figmaRawCode: "figmaImageProcessed",
  figmaImageProcessed: "figmaAstParsed",
  figmaAstParsed: "figmaBlockExtract",
  figmaBlockExtract: "figmaGeometryGroup",
  figmaGeometryGroup: "figmaSectionNaming",
  figmaSectionNaming: "figmaComponentGen",
  figmaComponentGen: "figmaAssembly",
  figmaAssembly: "done",
};

/** 统一的步骤流转（合并两个流程，保留 NEXT_STEP_MAP 名称向后兼容） */
export const NEXT_STEP_MAP: Record<string, StreamEventType> = {
  ...TRADITIONAL_STEP_MAP,
  ...FIGMA_STEP_MAP,
};

export const STEP_DEFINITIONS: Partial<Record<StreamEventType, StepContent>> = {
  // ==================== Traditional 流程步骤 ====================
  analysis: {
    title: "需求分析",
    description: {
      pending: "正在拆解您的需求...",
      success: "需求拆解完成，核心场景已确认。",
    },
  },
  intent: {
    title: "意图识别",
    description: {
      pending: "识别用户核心意图...",
      success: (data: unknown) =>
        `构建类型: ${(data as { category?: string })?.category || "General"}`,
    },
  },
  capabilities: {
    title: "能力检查",
    description: {
      pending: "规划技术能力...",
      success: "能力规划完成，数据模型已定义。",
    },
  },
  ui: {
    title: "UI 设计",
    description: {
      pending: "设计页面布局...",
      success: "UI 架构设计完成，页面结构已确认。",
    },
  },
  components: {
    title: "组件设计",
    description: {
      pending: "生成业务组件规范...",
      success: "组件契约生成完毕。",
    },
  },
  structure: {
    title: "结构规划",
    description: {
      pending: "生成项目文件结构...",
      success: "项目目录结构规划完成。",
    },
  },
  dependency: {
    title: "依赖分析",
    description: {
      pending: "分析项目所需依赖...",
      success: "依赖环境配置完成。",
    },
  },
  types: {
    title: "类型生成",
    description: {
      pending: "生成业务数据类型...",
      success: "业务数据类型定义完成。",
    },
  },
  utils: {
    title: "工具函数",
    description: {
      pending: "生成常用工具函数...",
      success: "工具函数文件生成完成。",
    },
  },
  mockData: {
    title: "模拟数据",
    description: {
      pending: "生成模拟数据文件...",
      success: "模拟数据文件生成完成。",
    },
  },
  service: {
    title: "业务逻辑",
    description: {
      pending: "生成业务逻辑文件...",
      success: "业务逻辑文件生成完成。",
    },
  },
  hooks: {
    title: "Hooks 层",
    description: {
      pending: "生成 Hooks 层文件...",
      success: "Hooks 层文件生成完成。",
    },
  },
  componentsCode: {
    title: "组件代码",
    description: {
      pending: "生成 UI 组件代码...",
      success: "UI 组件代码生成完成。",
    },
  },
  pagesCode: {
    title: "页面代码",
    description: {
      pending: "生成页面代码...",
      success: "页面代码生成完成。",
    },
  },
  layouts: {
    title: "布局组件",
    description: {
      pending: "生成 Layout 组件代码...",
      success: "Layout 组件代码生成完成。",
    },
  },
  styles: {
    title: "全局样式",
    description: {
      pending: "生成全局样式代码...",
      success: "全局样式代码生成完成。",
    },
  },
  app: {
    title: "入口文件",
    description: {
      pending: "生成 App.tsx 入口文件...",
      success: "App.tsx 入口文件生成完成。",
    },
  },
  files: {
    title: "项目组装",
    description: {
      pending: "组装所有生成的文件...",
      success: (data: unknown) => {
        const stats = (data as { stats?: { totalFiles?: number } })?.stats;
        return `项目组装完成，共 ${stats?.totalFiles || 0} 个文件。`;
      },
    },
  },

  // ==================== Figma 流程步骤 ====================
  figmaRawCode: {
    title: "解析设计稿",
    description: {
      pending: "正在连接 Figma 并获取设计代码...",
      success: (data: unknown) => {
        const d = data as { lineCount?: number; language?: string };
        return `成功获取 ${d?.language || "React"} 代码，共 ${d?.lineCount || 0} 行`;
      },
    },
  },
  figmaImageProcessed: {
    title: "处理图片资源",
    description: {
      pending: "正在下载图片并上传至云存储...",
      success: "所有图片资源已就绪",
    },
  },
  figmaAstParsed: {
    title: "分析代码结构",
    description: {
      pending: "正在解析 JSX/TSX 语法树...",
      success: (data: unknown) => {
        const d = data as {
          topLevelElements?: unknown[];
          helperComponents?: unknown[];
        };
        const elements = d?.topLevelElements?.length || 0;
        const components = d?.helperComponents?.length || 0;
        return `已识别 ${elements} 个元素和 ${components} 个辅助组件`;
      },
    },
  },
  figmaBlockExtract: {
    title: "提取布局信息",
    description: {
      pending: "正在提取元素坐标和尺寸...",
      success: (data: unknown) => {
        const d = data as { blocks?: unknown[] };
        return `已提取 ${d?.blocks?.length || 0} 个布局块`;
      },
    },
  },
  figmaGeometryGroup: {
    title: "智能分区",
    description: {
      pending: "正在基于几何位置进行区域聚类...",
      success: (data: unknown) => {
        const d = data as { sections?: unknown[] };
        return `已划分为 ${d?.sections?.length || 0} 个功能区域`;
      },
    },
  },
  figmaSectionNaming: {
    title: "语义识别",
    description: {
      pending: "AI 正在理解各区域的业务语义...",
      success: (data: unknown) => {
        const d = data as { sections?: { name?: string }[] };
        const names = d?.sections?.map((s) => s.name).join("、");
        return `已识别：${names || "多个语义区域"}`;
      },
    },
  },
  figmaComponentGen: {
    title: "生成组件",
    description: {
      pending: "AI 正在重构并生成高质量组件代码...",
      success: (data: unknown) => {
        const d = data as unknown[];
        return `已生成 ${Array.isArray(d) ? d.length : 0} 个可复用组件`;
      },
    },
  },
  figmaAssembly: {
    title: "项目组装",
    description: {
      pending: "正在组装所有文件和配置...",
      success: (data: unknown) => {
        const d = data as { stats?: { totalFiles?: number } };
        return `项目组装完成，共 ${d?.stats?.totalFiles || 0} 个文件`;
      },
    },
  },
};
