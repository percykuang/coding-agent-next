/**
 * Figma 直连流程 - AST 解析节点
 *
 * 职责：
 * 1. 接收 rawCode（MCP 生成的完整 TSX 代码）
 * 2. 使用 Babel AST 解析代码结构（确定性，无 AI）
 * 3. 输出: 主入口组件名、顶层 JSX 元素、全局资源、辅助组件
 *
 * 流程位置: Parsing Step 1 / 3
 * 上游: figmaInputNode (rawCode)
 * 下游: blockExtractNode (提取布局信息)
 */

import { parseTsxCode } from "../utils/jsxParser.js";
import type { AstParserOutput } from "../schemas/parsingSchema.js";

export const astParserNode = async (state: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("🌳 [AstParserNode] 开始 AST 解析");
  console.log("=".repeat(80));

  const { rawCode } = state;

  // ========== 1. 校验输入 ==========
  if (!rawCode) {
    console.error("❌ [AstParserNode] 错误: 缺少 rawCode");
    throw new Error("AstParserNode: 缺少 rawCode，请确保 figmaInputNode 已正确运行");
  }

  console.log(`📊 [AstParserNode] 输入代码: ${rawCode.length.toLocaleString()} 字符`);

  // ========== 2. Babel AST 解析 ==========
  let astResult: AstParserOutput;

  try {
    console.log("⏳ [AstParserNode] 正在进行 AST 解析...");
    astResult = parseTsxCode(rawCode);
  } catch (error) {
    console.error("❌ [AstParserNode] AST 解析失败:", error);
    throw new Error(
      `AST 解析失败: ${error instanceof Error ? error.message : String(error)}\n` +
        "可能原因：MCP 生成的代码含有语法错误",
    );
  }

  // ========== 3. 打印统计 ==========
  console.log("\n✅ [AstParserNode] AST 解析完成");
  console.log(`   📊 解析结果:`);
  console.log(`      - 主入口组件: ${astResult.entryComponentName}`);
  console.log(`      - 顶层 JSX 元素: ${astResult.jsxElements.length} 个`);
  console.log(`      - 全局图片资源: ${astResult.globalAssets.length} 个`);
  console.log(`      - 辅助组件: ${astResult.helperComponents.length} 个`);

  if (astResult.helperComponents.length > 0) {
    console.log(
      `      - 辅助组件列表: ${astResult.helperComponents.map((c) => c.name).join(", ")}`,
    );
  }

  if (astResult.jsxElements.length > 0) {
    console.log(`   📋 顶层 JSX 元素概览:`);
    astResult.jsxElements.forEach((elem, i) => {
      const preview = elem.rawJsx.substring(0, 80).replace(/\n/g, " ");
      console.log(
        `      [${i}] L${elem.loc.startLine}-${elem.loc.endLine} | children: ${elem.childrenCount} | ${preview}...`,
      );
    });
  }

  console.log("");

  // ========== 4. 返回结果 ==========
  return {
    astParserResult: astResult,
  };
};
