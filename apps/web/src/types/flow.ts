// 流程类型定义
// 将 Traditional 流程和 Figma 流程独立分离，方便后续扩展

/** 流程类型 */
export type FlowType = "traditional" | "figma";

// ============================================================================
// Traditional 流程类型
// ============================================================================

/** Traditional 流程的步骤类型 */
export type TraditionalStepType =
  | "analysis"
  | "intent"
  | "capabilities"
  | "ui"
  | "components"
  | "structure"
  | "dependency"
  | "types"
  | "utils"
  | "mockData"
  | "service"
  | "hooks"
  | "componentsCode"
  | "pagesCode"
  | "layouts"
  | "styles"
  | "app"
  | "files";

/** Traditional 流程的阶段 */
export type TraditionalPhase = "planning" | "foundation" | "logic" | "view" | "assembly";

// ============================================================================
// Figma 流程类型
// ============================================================================

/** Figma 流程的步骤类型 */
export type FigmaStepType =
  | "figmaRawCode"
  | "figmaImageProcessed"
  | "figmaAstParsed"
  | "figmaBlockExtract"
  | "figmaGeometryGroup"
  | "figmaSectionNaming"
  | "figmaComponentGen"
  | "figmaAssembly";

/** Figma 流程的阶段 */
export type FigmaPhase = "figma-input" | "figma-parsing" | "figma-refactoring" | "figma-assembly";

// ============================================================================
// 统一类型（联合）
// ============================================================================

/** 所有步骤类型的联合 */
export type StepType = TraditionalStepType | FigmaStepType;

/** 所有阶段类型的联合 */
export type Phase = TraditionalPhase | FigmaPhase;

/** Figma URL 检测正则 */
export const FIGMA_URL_REGEX =
  /https?:\/\/([\w.-]+\.)?figma\.com\/(file|design|proto|board)\/[\w-]+/i;

/** 检测内容是否包含 Figma URL */
export function isFigmaUrl(content: string): boolean {
  return FIGMA_URL_REGEX.test(content);
}
