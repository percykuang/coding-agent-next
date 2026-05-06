// step5: 项目结构定义
import { z } from "zod";

export const FileKindSchema = z.enum(["template", "overwrite", "new"]);

export const FileNodeSchema = z.object({
  path: z.string().describe("文件绝对路径，必须以 / 开头。例如：/components/MyComponent.tsx"),
  kind: FileKindSchema.describe(
    "文件处理策略：'template' (保留模板文件), 'overwrite' (覆盖模板文件), 'new' (新增文件)",
  ),
  description: z.string().describe("文件用途简要描述"),
  sourceCorrelation: z
    .string()
    .nullable()
    .describe(
      "源头关联：对于 'new' 文件，关联到 Step 4 的 ComponentID 或 Step 2 的 ModelName。如果是模板文件或非生成文件，请填 null。",
    ),
  generatedBy: z
    .string()
    .describe(
      "负责生成内容的步骤标识 (如 'step6-types', 'step7-mock', 'step8-app', 'step9-components', 'scaffold')",
    ),
});

export const StructureSchema = z.object({
  files: z.array(FileNodeSchema).describe("Sandpack 项目所需生成的完整文件清单"),
});

export type FileKind = z.infer<typeof FileKindSchema>;
export type FileNode = z.infer<typeof FileNodeSchema>;
export type ProjectStructure = z.infer<typeof StructureSchema>;
