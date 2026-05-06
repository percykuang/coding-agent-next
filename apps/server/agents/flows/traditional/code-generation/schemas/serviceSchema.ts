// step 10: 业务逻辑/服务层文件生成结果定义
import { z } from "zod";

export const ServiceSchema = z.object({
  files: z
    .array(
      z.object({
        path: z
          .string()
          .describe(
            "服务/逻辑文件的路径，通常位于 /services/ 目录下，如 '/services/novelService.ts'",
          ),
        content: z
          .string()
          .describe(
            "完整的文件代码内容。应包含基于 Mock 数据的数据访问函数、业务逻辑处理函数等。必须正确导入上一步生成的 Mock 数据和类型。",
          ),
        description: z
          .string()
          .describe("该服务文件的功能描述，如 '提供小说数据的增删改查及状态过滤功能'"),
      }),
    )
    .describe("生成的业务逻辑/服务层文件列表"),
});

export type T_Service = z.infer<typeof ServiceSchema>;
