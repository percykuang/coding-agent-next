/**
 * Figma Direct - Parsing 阶段统一类型定义
 *
 * 覆盖 Step 1 (AST Parser) → Step 2 (Block Extract) → Step 3 (Geometry Group)
 */

// ==================== Step 1: AST Parser 输出 ====================

/** AST 解析出的顶层 JSX 元素 */
export interface JsxElement {
  /** 在父节点中的顺序 */
  index: number;
  /** 原始 JSX 代码片段 */
  rawJsx: string;
  /** className 属性值 */
  className: string | null;
  /** 内联 style 对象（原始字符串形式） */
  inlineStyle: string | null;
  /** data-node-id 属性值 */
  nodeId: string | null;
  /** data-name 属性值 */
  dataName: string | null;
  /** 直接子元素数量 */
  childrenCount: number;
  /** 源码位置 */
  loc: {
    startLine: number;
    endLine: number;
  };
}

/** 全局图片资源变量 */
export interface GlobalAsset {
  /** 变量名 (如 imgRectangle53) */
  variableName: string;
  /** 图片 URL */
  url: string;
}

/** 小型工具组件（非主入口组件） */
export interface HelperComponent {
  /** 组件名 */
  name: string;
  /** 完整代码 */
  rawCode: string;
  /** 源码位置 */
  loc: {
    startLine: number;
    endLine: number;
  };
}

/** AST Parser Node 的输出 */
export interface AstParserOutput {
  /** 主入口组件名（export default 的组件） */
  entryComponentName: string;
  /** 顶层 JSX 元素列表 */
  jsxElements: JsxElement[];
  /** 全局图片资源 */
  globalAssets: GlobalAsset[];
  /** 辅助组件（如 RightC） */
  helperComponents: HelperComponent[];
}

// ==================== Step 2: Block Extract 输出 ====================

/** 带布局信息的标准化块 */
export interface LayoutBlock {
  /** 在原始列表中的索引 */
  index: number;
  /** 原始 JSX 代码片段 */
  rawJsx: string;
  /** Y 轴位置 (px) */
  top: number;
  /** X 轴位置 (px) */
  left: number;
  /** 宽度 (px)，0 表示未指定 */
  width: number;
  /** 高度 (px)，0 表示未指定 */
  height: number;
  /** 所有文本内容 */
  texts: string[];
  /** 引用的图片变量名 */
  usedAssets: string[];
  /** 直接子元素数量 */
  childrenCount: number;
  /** 是否为跨区域背景元素 */
  isBackground: boolean;
  /** data-node-id */
  nodeId: string | null;
  /** data-name */
  dataName: string | null;
}

/** Block Extract Node 的输出 */
export interface BlockExtractOutput {
  /** 标准化布局块列表 */
  layoutBlocks: LayoutBlock[];
  /** 页面总高度估算 (px) */
  pageHeight: number;
}

// ==================== Step 3: Geometry Group 输出 ====================

/** 几何分组后的 Section */
export interface Section {
  /** section 序号 (0-based) */
  index: number;
  /** 包含的布局块 */
  blocks: LayoutBlock[];
  /** Y 轴范围 */
  topRange: {
    min: number;
    max: number;
  };
  /** 汇总的文本内容 */
  allTexts: string[];
  /** 汇总的图片变量引用 */
  allAssets: string[];
  /** 布局块总数 */
  totalBlocks: number;
  /** 属于该 section 的背景元素 */
  backgroundBlocks: LayoutBlock[];
}

/** Geometry Group Node 的输出 */
export interface GeometryGroupOutput {
  /** 分组后的 section 列表 */
  sections: Section[];
  /** 分组使用的阈值 (px) */
  threshold: number;
}
