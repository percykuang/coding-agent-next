// step14.5: 生成 Layout 组件的 schema 定义
import { z } from "zod";

/**
 * 单个 Layout 组件的代码结构
 */
export const LayoutGenSchema = z.object({
  path: z
    .string()
    .describe("Layout 组件的文件路径，必须以 .tsx 结尾，例如 /layouts/MainLayout.tsx"),
  content: z
    .string()
    .describe(
      "Layout 组件的完整 React 代码内容。必须包含 Outlet 用于渲染子路由，使用 Tailwind CSS 进行样式编写。",
    ),
  description: z.string().describe("该 Layout 的简要描述，说明适用于哪些页面"),
  pages: z
    .array(z.string())
    .describe("使用此 Layout 的页面列表，例如 ['LibraryDashboard', 'NovelList']"),
});

export type T_LayoutGen = z.infer<typeof LayoutGenSchema>;

/**
 * Layout 节点的完整输出结构
 */
export const LayoutNodeOutputSchema = z.object({
  layoutsCode: z.array(LayoutGenSchema).describe("生成的所有 Layout 组件代码数组"),
  routeStructure: z
    .record(z.string(), z.array(z.string()))
    .describe("路由嵌套结构映射，key 为 Layout 名称，value 为该 Layout 下的页面名称数组"),
});

export type T_LayoutNodeOutput = z.infer<typeof LayoutNodeOutputSchema>;
