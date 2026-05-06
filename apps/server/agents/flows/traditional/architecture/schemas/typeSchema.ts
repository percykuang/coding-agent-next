// step7: 业务数据类型定义
import { z } from "zod";

// 单个类型文件的生成结果
export const TypeFileSchema = z.object({
  path: z.string().describe("文件路径，例如 /types/Novel.ts"),
  code: z.string().describe("类型定义代码内容 (interface/type)"),
  modelId: z.string().describe("对应的数据模型ID"),
});

// 集合
export const TypeGenerationSchema = z.object({
  files: z.array(TypeFileSchema).describe("生成的类型定义文件列表"),
});

export type TypeFile = z.infer<typeof TypeFileSchema>;
export type TypeGeneration = z.infer<typeof TypeGenerationSchema>;
