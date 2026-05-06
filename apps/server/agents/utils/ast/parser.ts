/**
 * AST 解析工具
 *
 * 封装 TypeScript Compiler API，提供便捷的 AST 解析和代码生成能力。
 * 专注于 JSX/TSX 文件的解析、遍历和修改。
 */

import ts from "typescript";

/**
 * 解析 TypeScript/TSX 代码为 AST
 */
export function parseCode(code: string, fileName = "temp.tsx"): ts.SourceFile {
  return ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") || fileName.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * 将 AST 转回代码字符串
 */
export function printCode(sourceFile: ts.SourceFile): string {
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,
    removeComments: false,
  });
  return printer.printFile(sourceFile);
}

/**
 * 获取节点的行号和列号
 */
export function getPosition(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): { line: number; column: number } {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { line: line + 1, column: character + 1 };
}

/**
 * 深度遍历 AST 节点，对每个节点调用回调
 */
export function walk(node: ts.Node, callback: (node: ts.Node) => void): void {
  callback(node);
  ts.forEachChild(node, (child) => walk(child, callback));
}

/**
 * 查找所有满足条件的 AST 节点
 */
export function findNodes(
  sourceFile: ts.SourceFile,
  predicate: (node: ts.Node) => boolean,
): ts.Node[] {
  const results: ts.Node[] = [];
  walk(sourceFile, (node) => {
    if (predicate(node)) {
      results.push(node);
    }
  });
  return results;
}

/**
 * 查找所有 JSX 表达式容器 { xxx }
 */
export function findJsxExpressions(sourceFile: ts.SourceFile): ts.JsxExpression[] {
  return findNodes(sourceFile, ts.isJsxExpression) as ts.JsxExpression[];
}

/**
 * 查找所有属性访问表达式 obj.prop
 */
export function findPropertyAccesses(sourceFile: ts.SourceFile): ts.PropertyAccessExpression[] {
  return findNodes(sourceFile, ts.isPropertyAccessExpression) as ts.PropertyAccessExpression[];
}

/**
 * 判断节点是否在 JSX 表达式容器内
 */
export function isInsideJsx(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isJsxExpression(current)) return true;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return true;
    current = current.parent;
  }
  return false;
}

/**
 * 判断 JSX 表达式是否用于属性值（不是子节点内容）
 * 例如: <img src={author.avatar} /> 中的 author.avatar 是属性值
 * 而 <p>{author}</p> 中的 author 是子节点
 */
export function isJsxAttributeValue(node: ts.Node): boolean {
  let current = node.parent;
  while (current) {
    if (ts.isJsxAttribute(current)) return true;
    if (ts.isJsxElement(current) || ts.isJsxSelfClosingElement(current)) return false;
    current = current.parent;
  }
  return false;
}

/**
 * 提取属性访问链
 * 例如: article.author.name -> ["article", "author", "name"]
 */
export function getAccessChain(node: ts.PropertyAccessExpression): string[] {
  const chain: string[] = [];
  let current: ts.Expression = node;

  while (ts.isPropertyAccessExpression(current)) {
    chain.unshift(current.name.text);
    current = current.expression;
  }

  if (ts.isIdentifier(current)) {
    chain.unshift(current.text);
  }

  return chain;
}

/**
 * 判断表达式是否是 .map() / .filter() / .forEach() 等数组方法调用
 */
export function isArrayMethodCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  if (!ts.isPropertyAccessExpression(node.expression)) return false;

  const method = node.expression.name.text;
  return ["map", "filter", "forEach", "find", "some", "every", "reduce", "flatMap"].includes(
    method,
  );
}

/**
 * 获取调用表达式中的方法名
 */
export function getCallMethodName(node: ts.CallExpression): string | null {
  if (ts.isPropertyAccessExpression(node.expression)) {
    return node.expression.name.text;
  }
  return null;
}

/**
 * 通过正则替换源代码中指定位置的文本
 * 比 AST Transform 更可靠，能精确保留原始格式
 *
 * @param source - 原始代码
 * @param start - 替换起始位置（0-based）
 * @param end - 替换结束位置（0-based, exclusive）
 * @param replacement - 替换内容
 */
export function replaceRange(
  source: string,
  start: number,
  end: number,
  replacement: string,
): string {
  return source.substring(0, start) + replacement + source.substring(end);
}

/**
 * 批量替换（从后往前替换，避免偏移问题）
 */
export function replaceRanges(
  source: string,
  replacements: Array<{ start: number; end: number; text: string }>,
): string {
  // 按 start 位置降序排列，从后往前替换
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let result = source;
  for (const { start, end, text } of sorted) {
    result = replaceRange(result, start, end, text);
  }
  return result;
}

/**
 * 判断文件是否是 JSX/TSX 组件文件
 */
export function isComponentFile(filePath: string): boolean {
  return (
    (filePath.endsWith(".tsx") || filePath.endsWith(".jsx")) &&
    !filePath.includes("/types/") &&
    !filePath.endsWith(".d.ts")
  );
}

/**
 * 判断文件是否是 Hook 文件
 */
export function isHookFile(filePath: string): boolean {
  const name = filePath.split("/").pop() || "";
  return name.startsWith("use") && (name.endsWith(".ts") || name.endsWith(".tsx"));
}

/**
 * 判断文件是否是需要进行 AST 后处理的文件
 */
export function shouldProcessFile(filePath: string): boolean {
  return isComponentFile(filePath) || isHookFile(filePath);
}
