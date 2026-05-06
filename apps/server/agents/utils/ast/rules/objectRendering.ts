/**
 * 规则：对象渲染检测与修复
 *
 * 检测 JSX 中直接渲染对象类型变量的问题：
 *   <p>{article.author}</p>           → <p>{article.author?.name}</p>
 *   <span>{item.category}</span>      → <span>{item.category?.name}</span>
 *   {reviews.map(r => <p>{r}</p>)}    → {reviews.map(r => <p>{r?.name}</p>)}
 *
 * 核心逻辑：
 * 1. 通过 TypeAnalyzer 获知哪些字段是对象类型
 * 2. 扫描所有 JSX 表达式
 * 3. 如果表达式直接引用了对象类型字段（没有继续访问子属性），标记为问题
 * 4. 修复：在对象访问末尾追加 ?.suggestedProperty
 */

import ts from "typescript";
import type { ASTRule, ASTIssue, RuleContext } from "../types.js";
import {
  parseCode,
  findJsxExpressions,
  getAccessChain,
  isJsxAttributeValue,
  getPosition,
  replaceRanges,
} from "../parser.js";

const RULE_NAME = "object-rendering";

/**
 * 对象渲染检测规则
 */
export const objectRenderingRule: ASTRule = {
  name: RULE_NAME,
  description: "检测 JSX 中直接渲染对象类型变量的问题，自动追加安全属性访问",

  check(code: string, fileName: string, context: RuleContext): ASTIssue[] {
    const issues: ASTIssue[] = [];
    const sourceFile = parseCode(code, fileName);
    // 收集所有 JSX 表达式
    const jsxExpressions = findJsxExpressions(sourceFile);

    for (const jsxExpr of jsxExpressions) {
      if (!jsxExpr.expression) continue;

      // 跳过属性值位置（如 src={author.avatar} 是合法的）
      // 那里的表达式不会触发 "Objects are not valid as React child"
      // 注意：仅跳过已经访问了子属性的情况
      const expr = jsxExpr.expression;

      // 情况1: {obj.field} - 属性访问，field 是对象类型
      if (ts.isPropertyAccessExpression(expr)) {
        const chain = getAccessChain(expr);
        const fieldName = chain[chain.length - 1];

        // 检查最后一个字段是否是对象类型
        const fieldMeta = findFieldMeta(fieldName, context);
        if (fieldMeta && fieldMeta.isObject && !fieldMeta.isArray) {
          // 如果在属性值位置，跳过（可能是传递给子组件的 prop）
          if (isJsxAttributeValue(jsxExpr)) continue;

          const pos = getPosition(expr, sourceFile);
          issues.push({
            type: "object-in-jsx",
            rule: RULE_NAME,
            file: fileName,
            line: pos.line,
            column: pos.column,
            message: `对象类型字段 "${fieldName}" (${fieldMeta.typeName}) 直接渲染在 JSX 中`,
            fixDescription: fieldMeta.suggestedProperty
              ? `追加 ?.${fieldMeta.suggestedProperty}`
              : `追加 JSON.stringify()`,
          });
        }
      }

      // 情况2: {variable} - 单独的标识符，可能是 map 回调参数
      if (ts.isIdentifier(expr)) {
        const varName = expr.text;
        // 检查这个变量是否来自 .map() 回调，且数组元素类型是对象
        const mapInfo = findEnclosingMapCallback(expr, sourceFile, context);
        if (mapInfo && !isJsxAttributeValue(jsxExpr)) {
          const pos = getPosition(expr, sourceFile);
          issues.push({
            type: "object-in-jsx",
            rule: RULE_NAME,
            file: fileName,
            line: pos.line,
            column: pos.column,
            message: `变量 "${varName}" 可能是对象类型，直接渲染在 JSX 中`,
            fixDescription: mapInfo.suggestedProperty
              ? `追加 ?.${mapInfo.suggestedProperty}`
              : `追加 JSON.stringify()`,
          });
        }
      }
    }

    return issues;
  },

  fix(code: string, fileName: string, issues: ASTIssue[], context: RuleContext): string {
    if (issues.length === 0) return code;

    const sourceFile = parseCode(code, fileName);
    const jsxExpressions = findJsxExpressions(sourceFile);
    const replacements: Array<{ start: number; end: number; text: string }> = [];

    for (const jsxExpr of jsxExpressions) {
      if (!jsxExpr.expression) continue;
      const expr = jsxExpr.expression;

      // 修复属性访问：obj.field → obj.field?.suggestedProp
      if (ts.isPropertyAccessExpression(expr)) {
        const chain = getAccessChain(expr);
        const fieldName = chain[chain.length - 1];
        const fieldMeta = findFieldMeta(fieldName, context);

        if (fieldMeta && fieldMeta.isObject && !fieldMeta.isArray) {
          if (isJsxAttributeValue(jsxExpr)) continue;

          const suggestedProp = fieldMeta.suggestedProperty;
          if (suggestedProp) {
            // obj.field → obj.field?.suggestedProp
            const exprText = expr.getText(sourceFile);
            replacements.push({
              start: expr.getStart(sourceFile),
              end: expr.getEnd(),
              text: `${exprText}?.${suggestedProp}`,
            });
          } else {
            // 无法推断属性，使用 JSON.stringify 兜底
            const exprText = expr.getText(sourceFile);
            replacements.push({
              start: expr.getStart(sourceFile),
              end: expr.getEnd(),
              text: `JSON.stringify(${exprText})`,
            });
          }
        }
      }

      // 修复标识符直接渲染
      if (ts.isIdentifier(expr)) {
        const mapInfo = findEnclosingMapCallback(expr, sourceFile, context);
        if (mapInfo && !isJsxAttributeValue(jsxExpr)) {
          const exprText = expr.getText(sourceFile);
          if (mapInfo.suggestedProperty) {
            replacements.push({
              start: expr.getStart(sourceFile),
              end: expr.getEnd(),
              text: `${exprText}?.${mapInfo.suggestedProperty}`,
            });
          } else {
            replacements.push({
              start: expr.getStart(sourceFile),
              end: expr.getEnd(),
              text: `JSON.stringify(${exprText})`,
            });
          }
        }
      }
    }

    if (replacements.length === 0) return code;
    return replaceRanges(code, replacements);
  },
};

// ===================== 辅助函数 =====================

/**
 * 在类型分析结果中查找字段元信息
 * 同时检查全局 objectFields 和各个类型定义
 */
function findFieldMeta(
  fieldName: string,
  context: RuleContext,
): {
  isObject: boolean;
  isArray: boolean;
  typeName: string;
  suggestedProperty: string | null;
} | null {
  const { objectFields, types } = context.typeAnalysis;

  // 先从全局对象字段映射中查找
  const globalField = objectFields.get(fieldName);
  if (globalField) return globalField;

  // 再遍历各类型查找
  for (const typeMeta of types.values()) {
    const field = typeMeta.fields.get(fieldName);
    if (field && field.isObject) return field;
  }

  return null;
}

/**
 * 查找标识符是否来自 .map() 回调的参数
 * 如果是，返回数组元素类型的建议属性
 */
function findEnclosingMapCallback(
  identifier: ts.Identifier,
  sourceFile: ts.SourceFile,
  context: RuleContext,
): { suggestedProperty: string | null } | null {
  // 向上查找 .map() 调用
  let current: ts.Node | undefined = identifier.parent;

  while (current) {
    // 找到箭头函数或函数表达式
    if (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) {
      // 检查父节点是否是 .map() 调用
      const parent = current.parent;
      if (
        parent &&
        ts.isCallExpression(parent) &&
        ts.isPropertyAccessExpression(parent.expression)
      ) {
        const methodName = parent.expression.name.text;
        if (methodName === "map" || methodName === "flatMap") {
          // 检查回调参数名是否匹配
          const params = current.parameters;
          if (params.length > 0) {
            const paramName = params[0].name;
            if (ts.isIdentifier(paramName) && paramName.text === identifier.text) {
              // 找到了！尝试推断数组元素类型
              const arrayExpr = parent.expression.expression;
              return inferArrayElementType(arrayExpr, sourceFile, context);
            }
          }
        }
      }
    }
    current = current.parent;
  }

  return null;
}

/**
 * 推断数组表达式的元素类型
 */
function inferArrayElementType(
  arrayExpr: ts.Expression,
  sourceFile: ts.SourceFile,
  context: RuleContext,
): { suggestedProperty: string | null } | null {
  // 如果是属性访问（如 article.tags, data.reviews）
  if (ts.isPropertyAccessExpression(arrayExpr)) {
    const fieldName = arrayExpr.name.text;
    const { types } = context.typeAnalysis;

    // 在所有类型中查找该数组字段
    for (const typeMeta of types.values()) {
      const field = typeMeta.fields.get(fieldName);
      if (field && field.isArray && field.isObject) {
        // 查找元素类型的展示属性
        const elementType = types.get(field.typeName);
        if (elementType) {
          // 找 name/title 等展示属性
          for (const [, f] of elementType.fields) {
            if (!f.isObject && !f.isArray && f.typeName === "string") {
              return { suggestedProperty: f.name };
            }
          }
        }
        return { suggestedProperty: null };
      }
    }
  }

  return null;
}
