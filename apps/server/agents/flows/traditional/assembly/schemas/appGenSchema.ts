import { z } from "zod";

/**
 * Step 15: App.tsx 生成 Schema
 *
 * 定义应用入口文件的输出结构
 */
export const AppGenSchema = z.object({
  /** 文件路径，固定为 /App.tsx */
  path: z.string().describe('文件路径，固定为 "/App.tsx"'),

  /** App.tsx 的完整代码内容 */
  content: z.string().describe("App.tsx 完整代码，包含路由配置、Provider 包装和组件导入"),

  /** 生成说明，简述路由结构和 Provider 配置 */
  description: z.string().describe("简要说明路由结构和使用的 Provider"),
});

export type T_AppGen = z.infer<typeof AppGenSchema>;
