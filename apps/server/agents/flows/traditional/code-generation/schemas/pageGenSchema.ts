import { z } from "zod";

export const PageGenSchema = z.object({
  path: z.string().describe("页面的文件路径 (例如: /pages/Dashboard.tsx)"),
  content: z.string().describe("完整的 React 页面代码"),
  description: z.string().describe("该页面的简要描述"),
});

export type T_PageGen = z.infer<typeof PageGenSchema>;
