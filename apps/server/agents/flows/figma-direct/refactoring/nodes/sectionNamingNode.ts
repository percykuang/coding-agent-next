/**
 * Figma 直连流程 - Section 命名节点
 *
 * 职责：
 * 1. 接收 geometryGroupResult（分组后的 Section 列表）
 * 2. 使用 AI 为每个 Section 起语义化的组件名称
 * 3. 输出 NamedSection 列表
 *
 * 流程位置: Refactoring Step 1 / 2
 * 上游: geometryGroupNode (geometryGroupResult)
 * 下游: componentGenNode (按 section 生成组件代码)
 *
 * 轻量级 AI 调用（只传摘要信息，不传原始代码）
 */

import {
  SectionNamingOutputSchema,
  type T_SectionNamingOutput,
} from "../schemas/refactoringSchema.js";
import {
  getSectionNamingSystemPrompt,
  getSectionNamingHumanPrompt,
} from "../prompts/sectionNamingPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { withRetry } from "../../../../utils/retry.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { GeometryGroupOutput } from "../../parsing/schemas/parsingSchema.js";

export const sectionNamingNode = async (state: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("🏷️ [SectionNamingNode] 开始 AI 命名");
  console.log("=".repeat(80));

  const groupResult: GeometryGroupOutput = state.geometryGroupResult;

  // ========== 1. 校验输入 ==========
  if (!groupResult || !groupResult.sections) {
    console.error("❌ [SectionNamingNode] 错误: 缺少 geometryGroupResult");
    throw new Error(
      "SectionNamingNode: 缺少 geometryGroupResult，请确保 geometryGroupNode 已正确运行",
    );
  }

  const sections = groupResult.sections;
  console.log(`📊 [SectionNamingNode] 需要命名的 Section: ${sections.length} 个`);

  // ========== 2. 准备摘要信息（不传原始 JSX，节省 token） ==========
  const sectionsInfo = sections.map((s) => ({
    index: s.index,
    totalBlocks: s.totalBlocks,
    topRange: s.topRange,
    allTexts: s.allTexts,
    allAssets: s.allAssets,
    hasBackground: s.backgroundBlocks.length > 0,
  }));

  // ========== 3. AI 命名调用 ==========
  const structuredModel = getStructuredModel(SectionNamingOutputSchema);

  const messages = [
    new SystemMessage(getSectionNamingSystemPrompt()),
    new HumanMessage(getSectionNamingHumanPrompt(sectionsInfo)),
  ];

  console.log("⏳ [SectionNamingNode] 正在调用 AI 命名...");

  let result: T_SectionNamingOutput;

  try {
    result = await withRetry(structuredModel, messages, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.warn(`⚠️ [SectionNamingNode] 命名重试 ${attempt}: ${error.message}`);
      },
    });
  } catch (error) {
    console.error("❌ [SectionNamingNode] AI 命名失败:", error);
    // Fallback: 使用默认命名
    console.log("⚠️ [SectionNamingNode] 使用默认命名作为 fallback");
    result = {
      namedSections: sections.map((s, i) => ({
        index: s.index,
        componentName: `Section${i + 1}`,
        description: `页面第 ${i + 1} 区域，包含 ${s.totalBlocks} 个元素`,
        fileName: `Section${i + 1}`,
      })),
    };
  }

  // ========== 4. 校验命名数量匹配 ==========
  if (result.namedSections.length !== sections.length) {
    console.warn(
      `⚠️ [SectionNamingNode] 命名数量不匹配: 期望 ${sections.length}, 实际 ${result.namedSections.length}`,
    );
    // 补全缺失的
    while (result.namedSections.length < sections.length) {
      const idx = result.namedSections.length;
      result.namedSections.push({
        index: idx,
        componentName: `Section${idx + 1}`,
        description: `页面第 ${idx + 1} 区域`,
        fileName: `Section${idx + 1}`,
      });
    }
  }

  // ========== 5. 组件名去重 ==========
  const nameCount = new Map<string, number>();
  for (const ns of result.namedSections) {
    const count = nameCount.get(ns.componentName) || 0;
    nameCount.set(ns.componentName, count + 1);
  }

  // 对重复名称添加数字后缀
  const nameUsed = new Map<string, number>();
  for (const ns of result.namedSections) {
    const total = nameCount.get(ns.componentName) || 1;
    if (total > 1) {
      const usedCount = (nameUsed.get(ns.componentName) || 0) + 1;
      nameUsed.set(ns.componentName, usedCount);
      const newName = `${ns.componentName}${usedCount}`;
      console.log(`   ⚠️ 重名修复: ${ns.componentName} → ${newName}`);
      ns.componentName = newName;
      ns.fileName = newName;
    }
  }

  // ========== 6. 打印结果 ==========
  console.log("\n✅ [SectionNamingNode] 命名完成");
  console.log(`   📋 命名结果:`);
  result.namedSections.forEach((ns) => {
    console.log(`      [${ns.index}] ${ns.componentName} - ${ns.description}`);
  });
  console.log("");

  return {
    sectionNamingResult: result,
  };
};
