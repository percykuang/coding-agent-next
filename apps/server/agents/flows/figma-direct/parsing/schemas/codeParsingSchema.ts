import { z } from "zod";

/**
 * Figma 直连流程 - 代码解析 Schema
 *
 * 定义 codeParsingNode 的输出结构
 * 用于描述 MCP 生成的单文件代码的内部结构
 *
 * 职责：只做结构分析，不做实际拆分
 */

// ==================== 子结构 ====================

/** 识别出的组件信息 */
const ParsedComponentSchema = z.object({
  /** 组件名称 (如 "HeroSection", "NavigationBar") */
  name: z.string().describe("组件名称（PascalCase）"),
  /** 起始行号 (1-based) */
  startLine: z.number().describe("组件在原始代码中的起始行号"),
  /** 结束行号 (1-based) */
  endLine: z.number().describe("组件在原始代码中的结束行号"),
  /** 组件功能描述 */
  description: z.string().describe("组件功能的简要描述"),
  /** 组件类型 */
  type: z
    .enum(["page", "section", "ui", "layout"])
    .describe("组件类型：page=页面级组件, section=页面区域, ui=通用UI组件, layout=布局组件"),
  /** 依赖的其他组件名称 */
  dependsOn: z.array(z.string()).describe("该组件引用的其他组件名称列表"),
  /** 使用的图片资源变量名 */
  usedAssets: z.array(z.string()).describe("该组件引用的图片资源变量名列表"),
});

/** 全局资源（图片、图标等） */
const GlobalAssetSchema = z.object({
  /** 变量名 */
  variableName: z.string().describe("图片变量名（如 imgRectangle53）"),
  /** 资源 URL */
  url: z.string().describe("图片 URL 地址"),
});

/** 建议的目录结构 */
const SuggestedStructureSchema = z.object({
  /** 需要拆分到 components/ 的组件名 */
  components: z.array(z.string()).describe("建议放到 components/ 目录的组件名"),
  /** 需要作为页面的组件名 */
  pages: z.array(z.string()).describe("建议放到 pages/ 目录的页面组件名"),
  /** 需要提取到 utils/ 的工具模块 */
  utils: z.array(z.string()).describe("建议放到 utils/ 目录的工具模块（如 assets.ts）"),
});

// ==================== 主 Schema ====================

export const CodeParsingSchema = z.object({
  /** 识别出的所有组件 */
  components: z.array(ParsedComponentSchema).describe("代码中识别出的所有 React 组件"),

  /** 全局资源列表 */
  globalAssets: z.array(GlobalAssetSchema).describe("顶部声明的全局图片/资源变量"),

  /** 样式策略 */
  styleStrategy: z
    .enum(["inline", "tailwind", "css-modules", "styled-components", "mixed"])
    .describe("代码使用的样式方案"),

  /** 第三方依赖库 */
  dependencies: z.array(z.string()).describe("代码中 import 的第三方库（不含 react/react-dom）"),

  /** 建议的目录结构 */
  suggestedStructure: SuggestedStructureSchema.describe("基于代码分析建议的文件拆分方案"),

  /** 整体代码质量评估 */
  codeQuality: z
    .object({
      /** 是否有 TypeScript 类型标注 */
      hasTypeAnnotations: z.boolean().describe("是否包含 TypeScript 类型标注"),
      /** 是否使用了 React Hooks */
      usesHooks: z.boolean().describe("是否使用了 React Hooks"),
      /** 总组件数量 */
      totalComponents: z.number().describe("总共识别出的组件数量"),
      /** 主入口组件名 */
      entryComponent: z.string().describe("主入口/根组件名（通常是 export default 的组件）"),
    })
    .describe("代码质量和特征评估"),
});

export type T_CodeParsing = z.infer<typeof CodeParsingSchema>;
