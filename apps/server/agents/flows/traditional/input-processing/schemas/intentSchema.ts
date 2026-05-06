// step1: 意图分析
import { z } from "zod/v4";

export const IntentSchema = z.object({
  product: z.object({
    name: z.string().min(1).describe("应用名称"),
    description: z.string().min(1).describe("应用描述"),
    targetUsers: z.array(z.string()).min(1).describe("目标用户"),
    primaryScenario: z.string().min(1).describe("主要场景"),
  }),
  goals: z.object({
    primary: z.array(z.string()).min(1).describe("应用要实现的主要目标"),
    secondary: z.array(z.string()).nullable().describe("应用要实现的次要目标"),
  }),
  nonGoals: z.array(z.string()).describe("应用不需要实现的目标"),
  assumptions: z.array(z.string()).nullable().describe("应用设计时的假设条件"),
  category: z.string().describe("应用类型"),
});

export type Intent = z.infer<typeof IntentSchema>;
