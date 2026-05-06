// step12: 生成component的schema定义
import { z } from "zod";

export const CompGenSchema = z.object({
  path: z.string().describe("组件的文件路径，必须以 .tsx 结尾，例如 /components/NovelCard.tsx"),
  content: z
    .string()
    .describe(
      "组件的完整 React 代码内容。必须包含所有必要的 import 语句，并使用 Tailwind CSS 进行样式编写。",
    ),
  description: z.string().optional().describe("组件功能的简要描述"),
});

export type T_ComponentGen = z.infer<typeof CompGenSchema>;
