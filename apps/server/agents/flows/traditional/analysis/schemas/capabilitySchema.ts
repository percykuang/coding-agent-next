// step2: 能力分析
import { z } from "zod";

const PageSchema = z.object({
  pageType: z
    .enum([
      "landing", // 落地页/首页 (展示型)
      "dashboard", // 仪表盘/概览 (数据可视化)
      "list", // 列表页 (集合展示)
      "detail", // 详情页 (信息展示)
      "form", // 表单页 (数据录入)
      "workspace", // 工作区 (复杂操作工具类，如编辑器)
      "settings", // 设置页
      "profile", // 个人中心
      "other",
    ])
    .describe("页面类型"),
  pageId: z.string().describe("页面唯一标识符 (PascalCase)"),
  description: z.string().describe("页面功能描述"),
  supportedGoals: z.array(z.string()).describe("该页面支持的业务目标"),
});

const BehaviorSchema = z.object({
  behaviorId: z.string().describe("行为标识符 (camelCase)"),
  description: z.string().describe("行为描述"),
  scope: z.array(z.string()).describe("涉及的页面ID列表"),
  optional: z.boolean().describe("是否为可选功能"),
});

const DataModelSchema = z.object({
  modelId: z.string().describe("模型唯一标识符 (PascalCase)"),
  description: z.string().describe("模型用途描述"),
  complexity: z.enum(["simple", "static", "list+detail", "complex"]).describe("数据复杂度"),
  fields: z.array(z.string()).describe("包含的字段列表"),
});

export const CapabilitySchema = z.object({
  pages: z.array(PageSchema).describe("应用包含的页面列表"),
  behaviors: z.array(BehaviorSchema).describe("应用包含的交互行为"),
  dataModels: z.array(DataModelSchema).describe("应用需要的数据模型"),
});

export type Capability = z.infer<typeof CapabilitySchema>;
