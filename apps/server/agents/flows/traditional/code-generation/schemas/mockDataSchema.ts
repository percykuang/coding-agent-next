// step7: 生成mock数据
import { z } from "zod";

export const MockDataSchema = z.object({
  files: z
    .array(
      z.object({
        path: z
          .string()
          .describe(
            "文件路径，通常位于 /data/ 目录下，例如 '/data/novels.ts'。建议按领域领域聚合，如 '/data/users.ts'",
          ),
        content: z
          .string()
          .describe(
            "完整的文件代码内容。包含 TypeScript 接口定义(export interface)和 Mock 数据常量(export const)。严禁包含任何辅助函数。",
          ),
        description: z.string().describe("该数据文件的用途简述"),
      }),
    )
    .describe("生成的 Mock 数据文件列表"),
});

export type T_MockData = z.infer<typeof MockDataSchema>;
