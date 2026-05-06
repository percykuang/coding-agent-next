// step0: 基础分析
import { z } from "zod";

export const AnalysisSchema = z.object({
  type: z
    .enum(["CREATE", "MODIFY", "QA", "CHIT_CHAT"])
    .describe("用户的意图类型：创建新应用、修改现有应用、提问或闲聊"),
  summary: z.string().describe("针对用户需求的简要总结"),
  tags: z.array(z.string()).describe("相关的技术标签或关键词"),
  complexity: z.enum(["SIMPLE", "MEDIUM", "COMPLEX"]).describe("评估任务的复杂度"),
  designAnalysis: z
    .string()
    .nullable()
    .describe(
      "如果用户上传了图片或明确描述了视觉风格，请总结可指导代码生成的视觉信息，例如布局结构、关键组件、配色与风格倾向；否则为 null。",
    ),
});

export type AnalysisResult = z.infer<typeof AnalysisSchema>;
