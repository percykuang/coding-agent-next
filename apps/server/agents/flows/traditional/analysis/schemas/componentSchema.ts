// step4: 组件规格定义
import { z } from "zod/v4";

// 组件属性定义
const PropSchema = z.object({
  name: z.string().describe("属性名称 (camelCase, 如 articles, onSave)"),
  type: z.string().describe("TypeScript类型定义 (如 'Article[]', 'boolean')"),
  description: z.string().describe("属性用途描述"),
  required: z.boolean().describe("是否为必填属性"),
});

// 组件事件定义
const EventSchema = z.object({
  name: z.string().describe("事件名称 (onXxx, 如 onNavigate, onChange)"),
  description: z.string().describe("事件触发时机描述"),
  parameters: z
    .array(z.object({ name: z.string(), type: z.string() }))
    .nullable()
    .describe("回调函数参数列表"),
});

// 组件规格说明
const ComponentSpecSchema = z.object({
  componentId: z
    .string()
    .describe(
      "业务组件唯一ID (PascalCase)。必须具有具体业务含义，如 'NovelListTable', 'ChapterEditorForm'，严禁使用 'Table', 'Form' 等通用名。",
    ),
  originalId: z.string().describe("对应 UI Schema 中的原始组件ID，用于追溯映射关系。"),
  type: z.string().describe("组件类型 (如 Table, Form, Navbar)"),
  description: z.string().describe("组件需实现的业务逻辑简述"),

  // 核心契约
  props: z.array(PropSchema).describe("组件接收的Props列表"),
  events: z.array(EventSchema).describe("组件对外暴露的事件列表"),

  // 依赖管理
  dataDependencies: z.array(z.string()).describe("依赖的数据模型ID (如 ['Article', 'User'])"),

  shadcnComponent: z
    .string()
    .nullable()
    .describe("基于哪个Shadcn基础组件构建 (如 'Table', 'Form')"),
});

export const ComponentSchema = z.object({
  components: z.array(ComponentSpecSchema).describe("需要生成的业务组件列表"),
});

export type ComponentSpec = z.infer<typeof ComponentSpecSchema>;
