/**
 * 规则：安全属性访问
 *
 * 检测可能导致 "Cannot read properties of null/undefined" 的属性访问，
 * 将 obj.prop 替换为 obj?.prop 或添加可选链。
 *
 * 场景：
 *   article.author.name   → article.author?.name
 *   data.categories[0]    → data.categories?.[0]
 *   item.tags.join(", ")  → item.tags?.join(", ")
 *
 * 核心逻辑：
 * 1. 找到所有属性访问链
 * 2. 如果被访问的对象可能为 null/undefined（来自 API 数据），添加可选链
 * 3. 重点关注数组方法调用前的安全检查
 */

import ts from "typescript";
import type { ASTRule, ASTIssue, RuleContext } from "../types.js";
import { parseCode, getPosition, walk, replaceRanges, isInsideJsx } from "../parser.js";

const RULE_NAME = "safe-property-access";

/** 数组方法列表 */
const ARRAY_METHODS = new Set([
  "map",
  "filter",
  "forEach",
  "find",
  "some",
  "every",
  "reduce",
  "flatMap",
  "slice",
  "sort",
  "join",
  "includes",
  "indexOf",
  "length",
]);

/** 字符串方法常导致 null crash 的 */
const STRING_METHODS = new Set([
  "match",
  "replace",
  "replaceAll",
  "split",
  "trim",
  "toLowerCase",
  "toUpperCase",
  "startsWith",
  "endsWith",
  "includes",
  "slice",
  "substring",
  "charAt",
  "indexOf",
]);

export const safePropertyAccessRule: ASTRule = {
  name: RULE_NAME,
  description: "为可能为 null/undefined 的属性访问添加可选链",

  check(code: string, fileName: string, context: RuleContext): ASTIssue[] {
    const issues: ASTIssue[] = [];
    const sourceFile = parseCode(code, fileName);

    walk(sourceFile, (node) => {
      // 1. 检查 obj.method() 调用 - 如果 obj 可能为 null 且 method 是数组/字符串操作
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const propAccess = node.expression;
        const methodName = propAccess.name.text;

        if (ARRAY_METHODS.has(methodName) || STRING_METHODS.has(methodName)) {
          // 检查调用对象是否需要可选链
          if (needsOptionalChain(propAccess, sourceFile)) {
            const pos = getPosition(propAccess, sourceFile);
            issues.push({
              type: "unsafe-method-call",
              rule: RULE_NAME,
              file: fileName,
              line: pos.line,
              column: pos.column,
              message: `对 "${propAccess.expression.getText(sourceFile)}" 调用 .${methodName}() 可能因 null/undefined 而崩溃`,
              fixDescription: `使用可选链 ?.${methodName}() 或添加空值检查`,
            });
          }
        }
      }

      // 2. 检查深层属性访问 a.b.c - 如果 b 是对象类型字段且可能为 null
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        isInsideJsx(node)
      ) {
        const innerAccess = node.expression;
        // 检查中间节点是否已经有可选链
        if (
          !node.questionDotToken &&
          needsOptionalChainForField(innerAccess, sourceFile, context)
        ) {
          const pos = getPosition(node, sourceFile);
          issues.push({
            type: "unsafe-deep-access",
            rule: RULE_NAME,
            file: fileName,
            line: pos.line,
            column: pos.column,
            message: `深层属性访问 "${node.getText(sourceFile)}" 可能因中间值为 null 而崩溃`,
          });
        }
      }
    });

    return issues;
  },

  fix(code: string, fileName: string, issues: ASTIssue[], context: RuleContext): string {
    if (issues.length === 0) return code;

    const sourceFile = parseCode(code, fileName);
    const replacements: Array<{ start: number; end: number; text: string }> = [];
    const processed = new Set<number>(); // 防止重复替换

    walk(sourceFile, (node) => {
      // 修复 unsafe-method-call
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const propAccess = node.expression;
        const methodName = propAccess.name.text;

        if (
          (ARRAY_METHODS.has(methodName) || STRING_METHODS.has(methodName)) &&
          needsOptionalChain(propAccess, sourceFile)
        ) {
          const start = propAccess.getStart(sourceFile);
          if (processed.has(start)) return;
          processed.add(start);

          // 方案：obj.method(...) → obj?.method(...)
          // 找到 .method 的点号位置
          const dotPos = findDotPosition(
            code,
            propAccess.expression.getEnd(),
            propAccess.name.getStart(sourceFile),
          );

          if (dotPos !== -1 && code[dotPos] === "." && code[dotPos + 1] !== "?") {
            replacements.push({
              start: dotPos,
              end: dotPos + 1,
              text: "?.",
            });
          }
        }
      }

      // 修复 unsafe-deep-access in JSX
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        isInsideJsx(node) &&
        !node.questionDotToken &&
        needsOptionalChainForField(node.expression, sourceFile, context)
      ) {
        const start = node.getStart(sourceFile);
        if (processed.has(start)) return;
        processed.add(start);

        const dotPos = findDotPosition(
          code,
          node.expression.getEnd(),
          node.name.getStart(sourceFile),
        );

        if (dotPos !== -1 && code[dotPos] === "." && code[dotPos + 1] !== "?") {
          replacements.push({
            start: dotPos,
            end: dotPos + 1,
            text: "?.",
          });
        }
      }
    });

    if (replacements.length === 0) return code;
    return replaceRanges(code, replacements);
  },
};

// ===================== 辅助函数 =====================

/**
 * 判断属性访问是否需要可选链
 * 条件：
 * 1. 当前没有可选链 (?.)
 * 2. 被访问的对象看起来是动态数据（来自 props、state、hooks 返回值等）
 */
function needsOptionalChain(
  propAccess: ts.PropertyAccessExpression,
  sourceFile: ts.SourceFile,
): boolean {
  // 已经有可选链了
  if (propAccess.questionDotToken) return false;

  // 被访问的表达式
  const obj = propAccess.expression;

  // 如果是属性访问链 (a.b.method) 检查中间变量
  if (ts.isPropertyAccessExpression(obj)) {
    // 如果中间已经有 ?.，说明已做保护
    if (obj.questionDotToken) return false;
    // 否则可能需要保护
    return isDynamicDataSource(obj, sourceFile);
  }

  // 如果是标识符直接调用 variable.method()
  if (ts.isIdentifier(obj)) {
    return isDynamicVariable(obj, sourceFile);
  }

  return false;
}

/**
 * 判断表达式是否来自动态数据源
 */
function isDynamicDataSource(
  expr: ts.PropertyAccessExpression,
  sourceFile: ts.SourceFile,
): boolean {
  const text = expr.getText(sourceFile);

  // 常见的动态数据模式
  const dynamicPatterns = [
    /^(props|data|state|item|article|game|review|post|user)\./,
    /\.(data|result|response|content|body)\b/,
  ];

  return dynamicPatterns.some((p) => p.test(text));
}

/**
 * 判断标识符是否是动态变量（来自 hook、props 解构等）
 */
function isDynamicVariable(identifier: ts.Identifier, _sourceFile: ts.SourceFile): boolean {
  const name = identifier.text;

  // 常见的动态数据变量名
  const dynamicNames = [
    "data",
    "result",
    "response",
    "article",
    "game",
    "review",
    "post",
    "user",
    "item",
    "content",
    "details",
  ];

  return dynamicNames.includes(name);
}

/**
 * 检查字段访问是否需要可选链
 */
function needsOptionalChainForField(
  innerAccess: ts.PropertyAccessExpression,
  sourceFile: ts.SourceFile,
  context: RuleContext,
): boolean {
  // 已有可选链
  if (innerAccess.questionDotToken) return false;

  const fieldName = innerAccess.name.text;
  const { objectFields } = context.typeAnalysis;

  // 如果该字段在类型中标记为对象类型，需要可选链
  return objectFields.has(fieldName);
}

/**
 * 找到两个位置之间的 . 号位置
 */
function findDotPosition(code: string, afterPos: number, beforePos: number): number {
  for (let i = afterPos; i < beforePos; i++) {
    if (code[i] === ".") return i;
  }
  return -1;
}
