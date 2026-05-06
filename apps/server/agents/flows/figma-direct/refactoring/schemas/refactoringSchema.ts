/**
 * Figma Direct - Refactoring 阶段类型定义
 *
 * 覆盖 Step 4 (Section Naming - AI) → Step 5 (Component Gen - AI)
 */

import { z } from "zod";

// ==================== Step 4: Section Naming (AI) ====================

/**
 * 单个 Section 的命名结果 Schema
 */
export const NamedSectionSchema = z.object({
  /** section 序号 (对应 geometryGroupResult 的 index) */
  index: z.number().describe("Section 序号"),
  /** 组件名称 (PascalCase, 如 HeroSection, FeatureGrid) */
  componentName: z.string().describe("组件名称，PascalCase 风格，如 HeroSection, FeatureGrid"),
  /** 该 section 的语义描述 */
  description: z
    .string()
    .describe("该 section 的语义描述，如：顶部主横幅区域，包含标题和 CTA 按钮"),
  /** 建议的文件名 (不含扩展名) */
  fileName: z.string().describe("建议的文件名，如 HeroSection"),
});

/**
 * Section Naming Node 的整体输出 Schema
 */
export const SectionNamingOutputSchema = z.object({
  /** 所有 section 的命名结果 */
  namedSections: z.array(NamedSectionSchema).describe("所有 section 的命名结果"),
});

export type T_NamedSection = z.infer<typeof NamedSectionSchema>;
export type T_SectionNamingOutput = z.infer<typeof SectionNamingOutputSchema>;

// ==================== Step 5: Component Gen (AI) ====================

/**
 * 生成的单个组件文件 Schema
 */
export const GeneratedFileSchema = z.object({
  /** 文件路径（相对于项目根目录，如 components/HeroSection.tsx） */
  filePath: z.string().describe("文件路径，如 components/HeroSection.tsx"),
  /** 完整的组件代码 */
  code: z.string().describe("完整的 React 组件代码，包含 import 和 export"),
  /** 组件名 */
  componentName: z.string().describe("组件名"),
});

/**
 * 单个 Section 的代码生成结果 Schema
 */
export const ComponentGenResultSchema = z.object({
  /** section 序号 */
  sectionIndex: z.number().describe("Section 序号"),
  /** 生成的文件 */
  file: GeneratedFileSchema.describe("生成的组件文件"),
});

export type T_GeneratedFile = z.infer<typeof GeneratedFileSchema>;
export type T_ComponentGenResult = z.infer<typeof ComponentGenResultSchema>;
