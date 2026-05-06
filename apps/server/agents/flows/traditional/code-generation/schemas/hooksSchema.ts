// step11: 生成 Hooks 代码
import { z } from "zod";

export const HooksSchema = z.object({
  files: z
    .array(
      z.object({
        path: z
          .string()
          .describe("Hook 文件的路径，通常位于 /hooks/ 目录下，如 '/hooks/useNovels.ts'"),
        content: z
          .string()
          .describe(
            "完整的文件代码内容。应包含基于 Service 层的自定义 Hook 逻辑，处理数据加载、Loading 状态和错误。",
          ),
        description: z
          .string()
          .describe(
            "该 Hook 文件的功能描述，如 '封装小说列表和详情的获取逻辑，包含 loading 状态管理'",
          ),
      }),
    )
    .describe("生成的自定义 Hooks 文件列表"),
});

export type T_Hooks = z.infer<typeof HooksSchema>;
