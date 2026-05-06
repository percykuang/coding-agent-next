/**
 * 路由层适配器的共享类型定义
 */

export interface RouteAdapterContext {
  messages: any[];
  mockConfig: Record<string, boolean>;
  existingFiles?: Record<string, string>;
}

export interface RouteAdapterResult {
  flow: "traditional" | "figma";
  input: Record<string, any>;
  meta?: Record<string, any>;
}

export interface RouteInputAdapter {
  name: string;
  priority: number;
  canHandle(context: RouteAdapterContext): boolean;
  adapt(context: RouteAdapterContext): Promise<RouteAdapterResult>;
}
