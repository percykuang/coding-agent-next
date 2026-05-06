import { z } from "zod";

/**
 * Step 16: 文件组装 Schema
 *
 * 定义最终输出给 Sandpack 的文件结构
 * Key: 文件路径 (如 "/App.tsx")
 * Value: 文件内容 (完整代码字符串)
 */
export const AssembleSchema = z.object({
  /**
   * 完整的文件映射，可直接传给 Sandpack
   * 格式: { "/App.tsx": "import ...", "/pages/Home.tsx": "..." }
   */
  files: z
    .record(z.string(), z.string())
    .describe("Sandpack 文件映射，key 为文件路径，value 为文件内容"),

  /** 文件统计信息 */
  stats: z
    .object({
      totalFiles: z.number().describe("总文件数"),
      categories: z.record(z.string(), z.number()).describe("各类别文件数量"),
    })
    .optional(),
});

export type T_Assemble = z.infer<typeof AssembleSchema>;
