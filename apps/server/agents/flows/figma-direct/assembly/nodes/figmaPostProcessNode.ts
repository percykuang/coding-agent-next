/**
 * Figma 流程 AST 后处理节点
 *
 * 复用 AST 后处理逻辑，适配 Figma 图的状态结构。
 */

import { postProcessFiles, printFixReport } from "../../../../utils/ast/fixer.js";

/**
 * Figma 流程的 AST 后处理
 * 状态结构与 Traditional 流程相同：state.files.files = Record<string, string>
 */
export async function figmaPostProcessNode(state: any) {
  console.log(`--- FigmaPostProcessNode (AST) Start ---`);

  const assembledFiles = state.files?.files;

  if (!assembledFiles || Object.keys(assembledFiles).length === 0) {
    console.warn("[PostProcess] No files found in Figma state, skipping");
    return {};
  }

  try {
    const { files: fixedFiles, result } = postProcessFiles(assembledFiles);
    printFixReport(result);

    if (result.totalFixes > 0) {
      console.log(`[PostProcess] Applied ${result.totalFixes} fixes to ${result.files.size} files`);

      return {
        files: {
          files: fixedFiles,
          stats: state.files?.stats
            ? {
                ...state.files.stats,
                astFixes: result.totalFixes,
                astIssues: result.totalIssues,
              }
            : undefined,
        },
      };
    }

    console.log("[PostProcess] No issues found, files unchanged");
    return {};
  } catch (error) {
    console.error("[PostProcess] AST post-processing failed:", error);
    return {};
  }
}
