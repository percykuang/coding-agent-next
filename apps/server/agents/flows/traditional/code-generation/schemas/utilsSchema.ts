import { z } from "zod";

export const UtilsFileSchema = z.object({
  path: z.string().describe("文件路径，通常为 /lib/utils.ts"),
  code: z.string().describe("完整的 TypeScript 代码内容"),
  description: z.string().optional().describe("工具函数文件的功能简述"),
});

export const UtilsGenerationSchema = z.object({
  files: z.array(UtilsFileSchema).describe("生成的工具文件列表"),
});

export type UtilsFile = z.infer<typeof UtilsFileSchema>;
export type UtilsGeneration = z.infer<typeof UtilsGenerationSchema>;
