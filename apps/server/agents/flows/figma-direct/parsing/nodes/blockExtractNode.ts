/**
 * Figma 直连流程 - 布局块提取节点
 *
 * 职责：
 * 1. 接收 astParserResult（AST 解析的顶层 JSX 元素）
 * 2. 从 Tailwind 类名和内联 style 中提取布局坐标 (top, left, width, height)
 * 3. 输出带定位信息的 LayoutBlock 列表
 *
 * 流程位置: Parsing Step 2 / 3
 * 上游: astParserNode (astParserResult)
 * 下游: geometryGroupNode (几何聚类)
 *
 * 确定性节点，无 AI 调用
 */

import { extractLayoutBlock } from "../utils/styleExtractor.js";
import type { AstParserOutput, BlockExtractOutput } from "../schemas/parsingSchema.js";

export const blockExtractNode = async (state: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("📦 [BlockExtractNode] 开始提取布局块");
  console.log("=".repeat(80));

  const astResult: AstParserOutput = state.astParserResult;

  // ========== 1. 校验输入 ==========
  if (!astResult || !astResult.jsxElements) {
    console.error("❌ [BlockExtractNode] 错误: 缺少 astParserResult");
    throw new Error("BlockExtractNode: 缺少 astParserResult，请确保 astParserNode 已正确运行");
  }

  console.log(`📊 [BlockExtractNode] 输入 JSX 元素: ${astResult.jsxElements.length} 个`);

  // ========== 2. 逐个提取布局信息 ==========
  const layoutBlocks = astResult.jsxElements.map((elem, i) => extractLayoutBlock(elem, i));

  // ========== 3. 计算页面总高度 ==========
  const pageHeight = layoutBlocks.reduce((max, block) => {
    const bottom = block.top + block.height;
    return Math.max(max, bottom);
  }, 0);

  // ========== 4. 统计信息 ==========
  const withPosition = layoutBlocks.filter((b) => b.top > 0 || b.left > 0).length;
  const withSize = layoutBlocks.filter((b) => b.width > 0 || b.height > 0).length;
  const bgCount = layoutBlocks.filter((b) => b.isBackground).length;

  console.log("\n✅ [BlockExtractNode] 布局块提取完成");
  console.log(`   📊 提取结果:`);
  console.log(`      - 总块数: ${layoutBlocks.length}`);
  console.log(`      - 有定位信息: ${withPosition} 个`);
  console.log(`      - 有尺寸信息: ${withSize} 个`);
  console.log(`      - 背景元素: ${bgCount} 个`);
  console.log(`      - 页面估算高度: ${pageHeight}px`);

  if (layoutBlocks.length > 0) {
    console.log(`   📋 布局块概览:`);
    layoutBlocks.forEach((block, i) => {
      const posInfo = `top:${block.top} left:${block.left} w:${block.width} h:${block.height}`;
      const textPreview =
        block.texts.length > 0
          ? ` texts:[${block.texts.slice(0, 2).join(", ")}${block.texts.length > 2 ? "..." : ""}]`
          : "";
      const bgFlag = block.isBackground ? " [BG]" : "";
      console.log(`      [${i}] ${posInfo}${bgFlag}${textPreview}`);
    });
  }

  console.log("");

  // ========== 5. 返回结果 ==========
  const result: BlockExtractOutput = {
    layoutBlocks,
    pageHeight,
  };

  return {
    blockExtractResult: result,
  };
};
