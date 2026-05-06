/**
 * Figma Direct - Assembly 阶段类型定义
 *
 * 覆盖 Step 6 (Assembly Node)
 * 输出与 Traditional 流程一致的 Sandpack 文件格式
 */

import { z } from "zod";

/**
 * Assembly Node 的输出 Schema
 * 与 Traditional 流程的 AssembleSchema 格式一致
 */
export const FigmaAssemblySchema = z.object({
  /** Sandpack 文件映射，key 为文件路径（如 /App.tsx），value 为文件内容 */
  files: z
    .record(z.string(), z.string())
    .describe("Sandpack 文件映射，key 为文件路径，value 为文件内容"),
  /** 统计信息 */
  stats: z
    .object({
      totalFiles: z.number(),
      categories: z.record(z.string(), z.number()),
    })
    .optional(),
});

export type T_FigmaAssembly = z.infer<typeof FigmaAssemblySchema>;
