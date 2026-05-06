// 类型统一导出
// 使用方式: import type { ChatMessage, FlowType, ... } from "@/types"

// API 相关类型
export * from "./api";

// 流程相关类型
export * from "./flow";

// 消息相关类型
export * from "./message";

// Store 相关类型
export * from "./store";

// 组件 Props 相关类型
export * from "./components";

// 配置相关类型
export * from "./config";

// 全局类型扩展（自动生效，无需显式导出）
/// <reference path="./global.d.ts" />
