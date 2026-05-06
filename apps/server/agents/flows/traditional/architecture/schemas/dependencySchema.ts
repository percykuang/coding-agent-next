// step6: 依赖关系分析
import { z } from "zod/v4";

export const DependencySchema = z.object({
  dependencies: z
    .record(z.string(), z.string())
    .describe(
      "项目所需的额外 NPM 依赖包列表。Key 是包名(如 'recharts')，Value 是版本号(如 '^2.10.0')。请勿包含模板已提供的基础依赖(如 react, react-dom)。",
    ),
  reason: z.string().describe("基于组件需求选择这些特定依赖的理由简述。"),
});

export type T_Dependency = z.infer<typeof DependencySchema>;
