import { z } from "zod";

/**
 * Figma 直连流程 - 输入节点 Schema
 *
 * 定义 figmaInputNode 的输出结构
 * 流程: Figma URL → MCP Server → 生成的原始代码
 */

// ==================== 输出 Schema ====================

/**
 * Figma 输入节点的输出 - MCP 生成的原始代码
 */
export const FigmaRawCodeSchema = z.object({
  /** MCP Server 生成的原始代码字符串 */
  rawCode: z.string().describe("Figma MCP Server 生成的完整代码"),
  /** 代码字符数 */
  codeLength: z.number().describe("代码字符数"),
  /** 代码行数 */
  lineCount: z.number().describe("代码行数"),
  /** 代码语言 */
  language: z.string().default("typescript").describe("代码语言"),
});

export type T_FigmaRawCode = z.infer<typeof FigmaRawCodeSchema>;
