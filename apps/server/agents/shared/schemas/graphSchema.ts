// Input Processing 阶段的 Schemas
import { IntentSchema } from "../../flows/traditional/input-processing/schemas/intentSchema.js";

// Analysis 阶段的 Schemas
import { AnalysisSchema } from "../../flows/traditional/analysis/schemas/analysisSchema.js";
import { CapabilitySchema } from "../../flows/traditional/analysis/schemas/capabilitySchema.js";
import { UISchema } from "../../flows/traditional/analysis/schemas/uiSchema.js";
import { ComponentSchema } from "../../flows/traditional/analysis/schemas/componentSchema.js";

// Architecture 阶段的 Schemas
import { StructureSchema } from "../../flows/traditional/architecture/schemas/structureSchema.js";
import { DependencySchema } from "../../flows/traditional/architecture/schemas/dependencySchema.js";
import { TypeGenerationSchema } from "../../flows/traditional/architecture/schemas/typeSchema.js";
import { LayoutNodeOutputSchema } from "../../flows/traditional/architecture/schemas/layoutSchema.js";

// Code Generation 阶段的 Schemas
import { UtilsGenerationSchema } from "../../flows/traditional/code-generation/schemas/utilsSchema.js";
import { MockDataSchema } from "../../flows/traditional/code-generation/schemas/mockDataSchema.js";
import { ServiceSchema } from "../../flows/traditional/code-generation/schemas/serviceSchema.js";
import { HooksSchema } from "../../flows/traditional/code-generation/schemas/hooksSchema.js";
import { CompGenSchema } from "../../flows/traditional/code-generation/schemas/compGenSchema.js";
import { PageGenSchema } from "../../flows/traditional/code-generation/schemas/pageGenSchema.js";
import { StyleGenSchema } from "../../flows/traditional/code-generation/schemas/styleGenSchema.js";

// Assembly 阶段的 Schemas
import { AppGenSchema } from "../../flows/traditional/assembly/schemas/appGenSchema.js";
import { AssembleSchema } from "../../flows/traditional/assembly/schemas/assembleSchema.js";

import { z } from "zod";

export const GraphSchema = z.object({
  // 初始输入：聊天记录 (原始 JSON 或 BaseMessage[])
  messages: z.array(z.any()).describe("聊天历史记录"),

  // 初始输入：当前工作区文件（用于增量改写现有项目）
  existingFiles: z
    .record(z.string(), z.string())
    .optional()
    .describe("当前工作区文件快照，key 为路径，value 为文件内容"),

  // 初始输入：Mock 配置
  mockConfig: z.record(z.string(), z.boolean()).optional().describe("各节点的 Mock 开关配置"),

  // 初始输入
  textPrompt: z.string().optional().describe("文本提示 (Legacy)"),

  // step0: 行为分析
  analysis: AnalysisSchema.optional(),

  // step0.5: 控制流标记
  skipGeneration: z.boolean().optional().describe("是否跳过代码生成流程"),

  // step1: 意图详情
  intent: IntentSchema.optional(),

  // step2: 能力分析
  capabilities: CapabilitySchema.optional(),

  // step3: UI架构分析
  ui: UISchema.optional(),

  // step4: 组件契约
  components: ComponentSchema.optional(),

  // step5: 项目结构
  structure: StructureSchema.optional(),

  // step6: 依赖管理 (Package.json + 增量依赖)
  dependency: DependencySchema.extend({
    packageJson: z.any().describe("完整的 package.json 对象"),
  }).optional(),

  // step7: 业务数据类型定义
  types: TypeGenerationSchema.optional(),

  // step8: 工具函数文件 (返回 { files: [...] } 格式)
  utils: UtilsGenerationSchema.optional(),

  // step9: Mock 数据 (单对象，包含 files 数组)
  mockData: MockDataSchema.optional(),

  // step10: 业务逻辑/服务层文件
  service: ServiceSchema.optional(),

  // step11: hooks 层文件
  hooks: HooksSchema.optional(),

  // step12: UI组件代码
  componentsCode: z.array(CompGenSchema).optional(),

  // step13:生成的页面代码
  pagesCode: z.array(PageGenSchema).optional(),

  // step14: Layout 节点输出（包含 layoutsCode 和 routeStructure）
  layouts: LayoutNodeOutputSchema.optional(),

  // step15: 全局样式
  styles: StyleGenSchema.optional(),

  // step15: App.tsx 入口文件
  app: AppGenSchema.optional(),

  // step16: 组装后的文件 (Sandpack 格式)
  files: AssembleSchema.optional(),
});

export type T_Graph = z.infer<typeof GraphSchema>;
