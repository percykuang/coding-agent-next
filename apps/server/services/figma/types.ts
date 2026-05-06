/**
 * Figma 相关类型定义
 */

// ==================== MCP Server 相关类型 ====================

/**
 * Figma MCP Server 返回的工具调用结果
 */
export interface FigmaToolResult {
  content: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
}

/**
 * Figma MCP Server 返回的完整设计数据
 */
export interface FigmaDesignData {
  metadata: string; // XML 格式的元数据
  context: any; // 设计上下文
  variables: any; // 设计变量和样式
}

// ==================== 解析后的数据类型 ====================

/**
 * Figma 页面信息
 */
export interface FigmaPage {
  name: string;
  route: string;
  frames: any[];
}

/**
 * Figma 组件信息
 */
export interface FigmaComponent {
  name: string;
  instances: number;
  figmaNodeId: string;
}

/**
 * Figma 设计令牌（Design Tokens）
 */
export interface FigmaDesignTokens {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  spacing: Record<string, string>;
}

/**
 * 解析后的 Figma 数据
 * 从原始 MCP 数据转换为应用所需格式
 */
export interface FigmaParsedData {
  pages: FigmaPage[];
  sharedComponents: FigmaComponent[];
  designTokens: FigmaDesignTokens;
  layout?: any;
}
