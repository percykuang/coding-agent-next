/**
 * 内置规则汇总
 */

export { objectRenderingRule } from "./objectRendering.js";
export { safePropertyAccessRule } from "./safeAccess.js";

import type { ASTRule } from "../types.js";
import { objectRenderingRule } from "./objectRendering.js";
import { safePropertyAccessRule } from "./safeAccess.js";

/**
 * 获取所有内置规则（推荐执行顺序）
 */
export function getBuiltinRules(): ASTRule[] {
  return [
    // 先修复对象渲染（优先级最高的运行时错误）
    objectRenderingRule,
    // 再添加安全属性访问
    safePropertyAccessRule,
  ];
}
