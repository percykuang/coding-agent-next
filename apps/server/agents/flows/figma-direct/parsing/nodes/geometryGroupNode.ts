/**
 * Figma 直连流程 - 几何聚类节点
 *
 * 职责：
 * 1. 接收 blockExtractResult（带布局信息的 LayoutBlock 列表）
 * 2. 使用 Y 轴自适应聚类算法将元素分组为 Section
 * 3. 输出 Section 列表（每个 Section 代表页面的一个区域）
 *
 * 流程位置: Parsing Step 3 / 3
 * 上游: blockExtractNode (blockExtractResult)
 * 下游: sectionNamingNode (AI 命名)
 *
 * 确定性节点，无 AI 调用
 */

import { clusterByGeometry } from "../utils/geometryCluster.js";
import type { BlockExtractOutput, GeometryGroupOutput } from "../schemas/parsingSchema.js";

export const geometryGroupNode = async (state: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("📐 [GeometryGroupNode] 开始几何聚类分组");
  console.log("=".repeat(80));

  const blockResult: BlockExtractOutput = state.blockExtractResult;

  // ========== 1. 校验输入 ==========
  if (!blockResult || !blockResult.layoutBlocks) {
    console.error("❌ [GeometryGroupNode] 错误: 缺少 blockExtractResult");
    throw new Error(
      "GeometryGroupNode: 缺少 blockExtractResult，请确保 blockExtractNode 已正确运行",
    );
  }

  console.log(
    `📊 [GeometryGroupNode] 输入布局块: ${blockResult.layoutBlocks.length} 个, 页面高度: ${blockResult.pageHeight}px`,
  );

  // ========== 2. 执行聚类 ==========
  let groupResult: GeometryGroupOutput;

  try {
    groupResult = clusterByGeometry(blockResult.layoutBlocks);
  } catch (error) {
    console.error("❌ [GeometryGroupNode] 聚类失败:", error);
    throw new Error(`几何聚类失败: ${error instanceof Error ? error.message : String(error)}`);
  }

  // ========== 3. 统计信息 ==========
  console.log("\n✅ [GeometryGroupNode] 聚类完成");
  console.log(`   📊 聚类结果:`);
  console.log(`      - Section 数量: ${groupResult.sections.length}`);
  console.log(`      - 使用阈值: ${groupResult.threshold}px`);

  if (groupResult.sections.length > 0) {
    console.log(`   📋 Section 概览:`);
    groupResult.sections.forEach((section, i) => {
      const textPreview =
        section.allTexts.length > 0
          ? ` texts:[${section.allTexts.slice(0, 3).join(", ")}${section.allTexts.length > 3 ? "..." : ""}]`
          : " (no text)";
      const assetInfo = section.allAssets.length > 0 ? ` assets:${section.allAssets.length}` : "";
      const bgInfo =
        section.backgroundBlocks.length > 0 ? ` bg:${section.backgroundBlocks.length}` : "";
      console.log(
        `      [Section ${i}] blocks:${section.totalBlocks} | Y:[${section.topRange.min}-${section.topRange.max}]${bgInfo}${assetInfo}${textPreview}`,
      );
    });
  }

  console.log("");

  // ========== 4. 返回结果 ==========
  return {
    geometryGroupResult: groupResult,
  };
};
