/**
 * 几何聚类算法
 *
 * 基于 Y 轴位置 (top) 对 LayoutBlock 进行自适应聚类分组，
 * 生成语义上有意义的 Section。
 *
 * 算法流程：
 * 1. 分离背景元素和普通元素
 * 2. 按 top 值排序
 * 3. 计算相邻元素的 gap 间距
 * 4. 自适应阈值 = median(gaps) * 1.5
 * 5. gap > threshold 则切开作为新 Section
 * 6. 将背景元素分配到覆盖范围内的 Section
 */

import type { LayoutBlock, Section, GeometryGroupOutput } from "../schemas/parsingSchema.js";

/** 最小阈值（避免过度分割） */
const MIN_THRESHOLD = 80;
/** 最大阈值（避免欠分割） */
const MAX_THRESHOLD = 500;
/** 最小 Section 数量 */
const MIN_SECTIONS = 2;
/** 最大 Section 数量 */
const MAX_SECTIONS = 15;
/** 最小 Section 高度（小于这个高度的 Section 会被合并到相邻 Section） */
const MIN_SECTION_HEIGHT = 100;

/**
 * 对 LayoutBlock 列表进行几何聚类分组
 */
export function clusterByGeometry(blocks: LayoutBlock[]): GeometryGroupOutput {
  if (blocks.length === 0) {
    return { sections: [], threshold: 0 };
  }

  // ========== 1. 分离背景元素和普通元素 ==========
  const normalBlocks = blocks.filter((b) => !b.isBackground);
  const backgroundBlocks = blocks.filter((b) => b.isBackground);

  if (normalBlocks.length === 0) {
    // 所有元素都是背景，整体作为一个 section
    return {
      sections: [buildSection(0, blocks, backgroundBlocks)],
      threshold: 0,
    };
  }

  // ========== 2. 按 top 值排序 ==========
  const sorted = [...normalBlocks].sort((a, b) => a.top - b.top);

  // 只有一个元素时
  if (sorted.length === 1) {
    return {
      sections: [buildSection(0, sorted, assignBackgrounds(backgroundBlocks, sorted))],
      threshold: 0,
    };
  }

  // ========== 3. 计算相邻间距 ==========
  const gaps: { index: number; gap: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].top - sorted[i - 1].top;
    gaps.push({ index: i, gap });
  }

  // ========== 4. 计算自适应阈值 ==========
  const threshold = computeAdaptiveThreshold(gaps.map((g) => g.gap));

  // ========== 5. 按阈值切割 ==========
  const groups: LayoutBlock[][] = [];
  let currentGroup: LayoutBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].top - sorted[i - 1].top;
    if (gap > threshold) {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    } else {
      currentGroup.push(sorted[i]);
    }
  }
  groups.push(currentGroup);

  // ========== 6. 后处理: 合并过小/过矮的 section ==========
  const heightMerged = mergeShortSections(groups);
  const mergedGroups = mergeSmallSections(heightMerged);

  // ========== 7. 构建 Section 并分配背景 ==========
  const sections = mergedGroups.map((group, i) => {
    const bgBlocks = assignBackgrounds(backgroundBlocks, group);
    return buildSection(i, group, bgBlocks);
  });

  return { sections, threshold };
}

// ==================== 内部工具函数 ====================

/**
 * 计算自适应阈值
 * 策略: median(gaps) * 1.5, 限制在 [MIN_THRESHOLD, MAX_THRESHOLD]
 */
function computeAdaptiveThreshold(gaps: number[]): number {
  if (gaps.length === 0) return MIN_THRESHOLD;

  const sorted = [...gaps].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  // 自适应因子
  const threshold = median * 1.5;

  // 钳位
  return Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, threshold));
}

/**
 * 合并高度过矮的 section（小于 MIN_SECTION_HEIGHT）
 * 将矮小的 section 合并到相邻的较近的 section
 */
function mergeShortSections(groups: LayoutBlock[][]): LayoutBlock[][] {
  if (groups.length <= MIN_SECTIONS) return groups;

  const result = [...groups];
  let i = 0;
  while (i < result.length && result.length > MIN_SECTIONS) {
    const group = result[i];
    const tops = group.map((b) => b.top);
    const heights = group.map((b) => b.height);
    const sectionTop = Math.min(...tops);
    const sectionBottom = Math.max(...tops.map((t, idx) => t + heights[idx]));
    const sectionHeight = sectionBottom - sectionTop;

    if (sectionHeight < MIN_SECTION_HEIGHT && group.length <= 2) {
      // 合并到相邻的 section（优先合并到下方，如果是最后一个则合并到上方）
      if (i < result.length - 1) {
        result[i + 1] = [...group, ...result[i + 1]];
      } else if (i > 0) {
        result[i - 1] = [...result[i - 1], ...group];
      } else {
        i++;
        continue;
      }
      result.splice(i, 1);
      // 不递增 i，继续检查同一位置
    } else {
      i++;
    }
  }
  return result;
}

/**
 * 合并过多的 section（超过 MAX_SECTIONS 时触发）
 * 将相邻间距最小的 section 合并
 */
function mergeSmallSections(groups: LayoutBlock[][]): LayoutBlock[][] {
  if (groups.length <= MIN_SECTIONS) return groups;
  if (groups.length <= MAX_SECTIONS) return groups;

  // 如果超过 MAX_SECTIONS，尝试合并最小的 sections
  const result = [...groups];

  while (result.length > MAX_SECTIONS) {
    // 找到相邻 section 之间最小间距
    let minGap = Infinity;
    let mergeIdx = 0;

    for (let i = 0; i < result.length - 1; i++) {
      const currentLast = result[i][result[i].length - 1];
      const nextFirst = result[i + 1][0];
      const gap = nextFirst.top - currentLast.top;
      if (gap < minGap) {
        minGap = gap;
        mergeIdx = i;
      }
    }

    // 合并 mergeIdx 和 mergeIdx + 1
    result[mergeIdx] = [...result[mergeIdx], ...result[mergeIdx + 1]];
    result.splice(mergeIdx + 1, 1);
  }

  return result;
}

/**
 * 将背景元素分配到覆盖范围匹配的 section
 * 背景元素的 top 在 section 的 [topMin, topMax] 范围内则分配
 */
function assignBackgrounds(bgBlocks: LayoutBlock[], sectionBlocks: LayoutBlock[]): LayoutBlock[] {
  if (bgBlocks.length === 0 || sectionBlocks.length === 0) return [];

  const sectionTopMin = Math.min(...sectionBlocks.map((b) => b.top));
  const sectionTopMax = Math.max(...sectionBlocks.map((b) => b.top));

  return bgBlocks.filter((bg) => {
    const bgBottom = bg.top + bg.height;
    // 背景的范围与 section 的范围有交集
    return bg.top <= sectionTopMax && bgBottom >= sectionTopMin;
  });
}

/**
 * 构建 Section 对象
 */
function buildSection(
  index: number,
  blocks: LayoutBlock[],
  backgroundBlocks: LayoutBlock[],
): Section {
  const tops = blocks.map((b) => b.top);
  const topMin = Math.min(...tops);
  const topMax = Math.max(...tops);

  const allTexts = blocks.flatMap((b) => b.texts);
  // 合并内容块和背景块的资源引用，确保背景图片也在可用列表中
  const contentAssets = blocks.flatMap((b) => b.usedAssets);
  const bgAssets = backgroundBlocks.flatMap((b) => b.usedAssets);
  const allAssets = [...new Set([...contentAssets, ...bgAssets])];

  return {
    index,
    blocks,
    topRange: { min: topMin, max: topMax },
    allTexts: [...new Set(allTexts)],
    allAssets,
    totalBlocks: blocks.length,
    backgroundBlocks,
  };
}
