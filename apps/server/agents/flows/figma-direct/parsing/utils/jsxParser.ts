/**
 * JSX AST 解析器
 *
 * 使用 Babel 解析 MCP 生成的 TSX 代码，提取：
 * 1. 主入口组件（export default）
 * 2. 主入口组件 return 块中的顶层 JSX 元素
 * 3. 全局图片资源变量（const imgXxx = "https://..."）
 * 4. 辅助组件（非 export default 的函数组件）
 */

import * as parser from "@babel/parser";
import _traverse from "@babel/traverse";
import * as t from "@babel/types";
import type {
  AstParserOutput,
  JsxElement,
  GlobalAsset,
  HelperComponent,
} from "../schemas/parsingSchema.js";

// Handle CJS/ESM default export compatibility
const traverse =
  typeof _traverse === "function" ? _traverse : (_traverse as any).default || _traverse;

/**
 * 解析 TSX 源码，提取结构信息
 */
export function parseTsxCode(rawCode: string): AstParserOutput {
  // ========== 1. Babel 解析为 AST ==========
  const ast = parser.parse(rawCode, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  const lines = rawCode.split("\n");

  // 收集结果
  let entryComponentName = "App";
  const jsxElements: JsxElement[] = [];
  const globalAssets: GlobalAsset[] = [];
  const helperComponents: HelperComponent[] = [];

  // 记录 export default 的组件名
  let defaultExportName: string | null = null;

  // ========== 2. 第一趟遍历: 找 export default + 全局资源 ==========
  traverse(ast, {
    // export default function Xxx() { ... }
    ExportDefaultDeclaration(path: any) {
      const decl = path.node.declaration;
      if (t.isFunctionDeclaration(decl) && decl.id) {
        defaultExportName = decl.id.name;
      } else if (t.isIdentifier(decl)) {
        defaultExportName = decl.name;
      }
    },

    // 顶层 const imgXxx = "https://..." 资源变量
    VariableDeclaration(path: any) {
      // 只处理顶层变量
      if (path.parent.type !== "Program") return;

      for (const declarator of path.node.declarations) {
        if (!t.isIdentifier(declarator.id)) continue;
        const name = declarator.id.name;

        // 匹配 img 开头的变量，值为字符串字面量 URL
        if (
          /^img[A-Za-z0-9]/.test(name) &&
          t.isStringLiteral(declarator.init) &&
          /^https?:\/\//.test(declarator.init.value)
        ) {
          globalAssets.push({
            variableName: name,
            url: declarator.init.value,
          });
        }
      }
    },
  });

  entryComponentName = defaultExportName || "App";

  // ========== 3. 第二趟遍历: 找辅助组件 + 主入口 JSX ==========
  traverse(ast, {
    // 函数声明
    FunctionDeclaration(path: any) {
      const node = path.node;
      if (!node.id) return;
      const name = node.id.name;

      // 跳过主入口组件
      if (name === entryComponentName) return;

      // 只处理顶层函数
      if (path.parent.type !== "Program" && path.parent.type !== "ExportDefaultDeclaration") return;

      // 检测是否是 React 组件（返回 JSX）
      if (hasJsxReturn(node.body)) {
        const startLine = node.loc?.start.line ?? 0;
        const endLine = node.loc?.end.line ?? 0;
        helperComponents.push({
          name,
          rawCode: extractSourceLines(lines, startLine, endLine),
          loc: { startLine, endLine },
        });
      }
    },

    // 箭头函数组件: const Xxx = () => { ... }
    VariableDeclaration(path: any) {
      if (path.parent.type !== "Program") return;

      for (const declarator of path.node.declarations) {
        if (!t.isIdentifier(declarator.id)) continue;
        const name = declarator.id.name;

        // 跳过主入口组件和资源变量
        if (name === entryComponentName) continue;
        if (/^img[A-Z]/.test(name)) continue;

        // 检测箭头函数/函数表达式，且首字母大写（约定为组件）
        const init = declarator.init;
        if (
          (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) &&
          /^[A-Z]/.test(name)
        ) {
          if (init.body && hasJsxReturn(init.body)) {
            const startLine = path.node.loc?.start.line ?? 0;
            const endLine = path.node.loc?.end.line ?? 0;
            helperComponents.push({
              name,
              rawCode: extractSourceLines(lines, startLine, endLine),
              loc: { startLine, endLine },
            });
          }
        }
      }
    },
  });

  // ========== 4. 提取主入口组件内的顶层 JSX 子元素 ==========
  traverse(ast, {
    FunctionDeclaration(path: any) {
      if (path.node.id?.name !== entryComponentName) return;
      extractTopLevelJsx(path, lines, jsxElements);
    },

    VariableDeclarator(path: any) {
      if (!t.isIdentifier(path.node.id)) return;
      if (path.node.id.name !== entryComponentName) return;
      const init = path.node.init;
      if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
        extractTopLevelJsx(path, lines, jsxElements);
      }
    },
  });

  return {
    entryComponentName,
    jsxElements,
    globalAssets,
    helperComponents,
  };
}

// ==================== 内部工具函数 ====================

/**
 * 从组件函数体中找到 return 的 JSX，提取顶层子元素
 */
function extractTopLevelJsx(path: any, lines: string[], result: JsxElement[]) {
  // 在函数体内找 ReturnStatement
  path.traverse({
    ReturnStatement(retPath: any) {
      const arg = retPath.node.argument;
      if (!arg) return;

      // return (...) 可能包裹了 JSX 表达式
      const jsxRoot = unwrapParenthesized(arg);
      if (!jsxRoot) return;

      // 如果根元素是 JSXFragment (<>...</>) 或一个容器 div
      // 提取其直接子元素作为顶层块
      const children = getJsxChildren(jsxRoot);

      if (children.length > 0) {
        // 有子元素，逐个提取
        children.forEach((child: any, i: number) => {
          const elem = buildJsxElement(child, lines, i);
          if (elem) result.push(elem);
        });
      } else if (t.isJSXElement(jsxRoot) || t.isJSXFragment(jsxRoot)) {
        // 只有根元素自身
        const elem = buildJsxElement(jsxRoot, lines, 0);
        if (elem) result.push(elem);
      }

      // 只处理第一个 return
      retPath.stop();
    },
  });
}

/**
 * 获取 JSX 元素的直接子 JSX 元素 (过滤掉文本/空白)
 */
function getJsxChildren(node: any): any[] {
  if (!node.children) return [];
  return node.children.filter((child: any) => t.isJSXElement(child) || t.isJSXFragment(child));
}

/**
 * 解除 ParenthesizedExpression 包装
 */
function unwrapParenthesized(node: any): any {
  if (t.isParenthesizedExpression(node)) {
    return unwrapParenthesized(node.expression);
  }
  return node;
}

/**
 * 构建 JsxElement 对象
 */
function buildJsxElement(node: any, lines: string[], index: number): JsxElement | null {
  const startLine = node.loc?.start.line;
  const endLine = node.loc?.end.line;
  if (!startLine || !endLine) return null;

  const rawJsx = extractSourceLines(lines, startLine, endLine);
  const className = extractAttribute(node, "className");
  const inlineStyle = extractStyleAttribute(node);
  const nodeId = extractAttribute(node, "data-node-id");
  const dataName = extractAttribute(node, "data-name");
  const childrenCount = getJsxChildren(node).length;

  return {
    index,
    rawJsx,
    className,
    inlineStyle,
    nodeId,
    dataName,
    childrenCount,
    loc: { startLine, endLine },
  };
}

/**
 * 提取 JSX 属性的字符串值
 */
function extractAttribute(node: any, attrName: string): string | null {
  if (!t.isJSXElement(node)) return null;

  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue;
    if (!t.isJSXIdentifier(attr.name)) continue;
    if (attr.name.name !== attrName) continue;

    const value = attr.value;
    if (t.isStringLiteral(value)) {
      return value.value;
    }
    if (t.isJSXExpressionContainer(value)) {
      if (t.isStringLiteral(value.expression)) {
        return value.expression.value;
      }
      if (t.isTemplateLiteral(value.expression)) {
        // 简单拼接模板字面量
        return value.expression.quasis.map((q: any) => q.value.raw).join("...");
      }
    }
  }
  return null;
}

/**
 * 提取 style 属性值（返回字符串表示）
 */
function extractStyleAttribute(node: any): string | null {
  if (!t.isJSXElement(node)) return null;

  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue;
    if (!t.isJSXIdentifier(attr.name)) continue;
    if (attr.name.name !== "style") continue;

    const value = attr.value;
    if (t.isJSXExpressionContainer(value)) {
      if (t.isObjectExpression(value.expression)) {
        return objectExpressionToString(value.expression);
      }
    }
  }
  return null;
}

/**
 * 将 ObjectExpression 转为简单字符串表示
 * 如: { width: '100px', height: '200px' } → "width:100px;height:200px"
 */
function objectExpressionToString(node: any): string | null {
  const pairs: string[] = [];
  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop)) continue;
    const key = t.isIdentifier(prop.key)
      ? prop.key.name
      : t.isStringLiteral(prop.key)
        ? prop.key.value
        : null;
    if (!key) continue;

    let value: string | null = null;
    if (t.isStringLiteral(prop.value)) {
      value = prop.value.value;
    } else if (t.isNumericLiteral(prop.value)) {
      value = String(prop.value.value);
    } else if (t.isTemplateLiteral(prop.value)) {
      value = prop.value.quasis.map((q: any) => q.value.raw).join("...");
    }

    if (key && value !== null) {
      pairs.push(`${key}:${value}`);
    }
  }
  return pairs.join(";") || null;
}

/**
 * 检测函数体是否包含 JSX return
 */
function hasJsxReturn(body: any): boolean {
  if (t.isBlockStatement(body)) {
    return body.body.some((stmt: any) => {
      if (t.isReturnStatement(stmt)) {
        const arg = stmt.argument;
        return (
          arg &&
          (t.isJSXElement(arg) ||
            t.isJSXFragment(arg) ||
            (t.isParenthesizedExpression(arg) &&
              (t.isJSXElement(arg.expression) || t.isJSXFragment(arg.expression))))
        );
      }
      return false;
    });
  }
  // 箭头函数简写: () => <div>...</div>
  return (
    t.isJSXElement(body) ||
    t.isJSXFragment(body) ||
    (t.isParenthesizedExpression(body) &&
      (t.isJSXElement(body.expression) || t.isJSXFragment(body.expression)))
  );
}

/**
 * 从源码行数组中提取指定范围的代码
 */
function extractSourceLines(lines: string[], startLine: number, endLine: number): string {
  // lines 是 0-indexed, 行号是 1-indexed
  return lines.slice(startLine - 1, endLine).join("\n");
}
