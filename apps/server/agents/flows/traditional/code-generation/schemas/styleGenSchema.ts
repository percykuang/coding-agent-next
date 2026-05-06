import { z } from "zod";

/**
 * Step 14: 全局样式生成 Schema
 *
 * 生成 styles.css 文件，包含：
 * - CSS 变量定义（颜色、间距、字体等）
 * - 页面布局容器类
 * - 动画/过渡效果
 * - 与 Tailwind 互补的自定义样式
 */
export const StyleGenSchema = z.object({
  path: z.string().describe("样式文件路径，固定为 styles.css"),

  content: z
    .string()
    .describe(
      "完整的 CSS 代码内容。应包含 CSS 变量定义、布局容器类、动画效果等。与 Tailwind 互补，避免重复。",
    ),

  description: z.string().describe("该样式文件的简要说明，描述主要包含哪些样式规则"),
});

export type T_StyleGen = z.infer<typeof StyleGenSchema>;
