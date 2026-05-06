/**
 * AST 后处理节点
 *
 * 在 assembleNode 之后、END 之前执行。
 * 对已组装的 Sandpack 文件集合进行 AST 分析和自动修复。
 *
 * 这是一个纯 TypeScript 节点，不调用 LLM。
 * 通过分析 types/*.ts 中的类型定义，动态生成修复规则。
 */

import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { postProcessFiles, printFixReport } from "../../../../utils/ast/fixer.js";

/**
 * Step 17: AST 后处理节点
 *
 * 输入：state.files.files (Record<string, string>) - 由 assembleNode 组装的 Sandpack 文件
 * 输出：修复后的 state.files
 *
 * 修复项目：
 * - 对象类型字段直接渲染在 JSX 中（"Objects are not valid as React child"）
 * - 缺少可选链导致 null crash（"Cannot read properties of null"）
 * - 数组/字符串方法调用缺少空值检查
 */
export async function postProcessNode(state: T_Graph) {
  console.log(`--- PostProcessNode (AST) Start ---`);

  // 获取组装后的文件集合
  const assembledFiles = state.files?.files;

  if (!assembledFiles || Object.keys(assembledFiles).length === 0) {
    console.warn("[PostProcess] No files found in state, skipping AST post-processing");
    return {};
  }

  try {
    // 执行 AST 后处理
    const { files: fixedFiles, result } = postProcessFiles(assembledFiles);

    // 打印修复报告
    printFixReport(result);

    // 如果有修复，更新 files
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
    // AST 后处理失败不应阻断流程
    console.error("[PostProcess] AST post-processing failed:", error);
    console.warn("[PostProcess] Continuing with original files");
    return {};
  }
}
