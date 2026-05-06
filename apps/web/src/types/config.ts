// 配置相关类型定义
import type { StepType, Phase, FlowType } from "./flow";

// ============================================================================
// 流程配置类型
// ============================================================================

/** 流程元数据 */
export interface FlowConfig {
  name: string;
  description: string;
  initialStep: StepType;
  phases: Phase[];
}

/** 流程配置映射 */
export type FlowConfigMap = Record<FlowType, FlowConfig>;

// ============================================================================
// 步骤定义类型
// ============================================================================

/** 步骤内容配置 */
export interface StepContent {
  title: string;
  description: {
    pending: string;
    success: string | ((data: unknown) => string);
  };
}
