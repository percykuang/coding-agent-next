/**
 * AST 修复器
 *
 * 提供顶层 API，将所有 AST 分析和修复能力整合为一个简单的调用。
 * 这是外部代码（如 LangGraph 节点）调用的主要入口。
 */

import type { FixResult, RuleContext } from "./types.js";
import { createRuleEngine, RuleEngine } from "./ruleEngine.js";
import { getBuiltinRules } from "./rules/index.js";
import { analyzeTypes } from "./typeAnalyzer.js";
import { shouldProcessFile } from "./parser.js";
import ts from "typescript";
import path from "path";

/**
 * 对 Sandpack 文件集合进行 AST 后处理
 *
 * 使用流程：
 * 1. 从 types/*.ts 文件中提取类型信息
 * 2. 对 components/*.tsx, pages/*.tsx, hooks/*.ts 等文件执行规则检查
 * 3. 自动修复发现的问题
 * 4. 返回修复后的文件集合
 *
 * @param files - Sandpack 格式文件集合 Record<string, string>
 * @returns { files, result } - 修复后的文件集合和详细报告
 */
export function postProcessFiles(files: Record<string, string>): {
  files: Record<string, string>;
  result: FixResult;
} {
  const engine = createRuleEngine(getBuiltinRules());
  const normalizedFiles = normalizeSandpackFiles(files);
  return engine.processAndApply(normalizedFiles);
}

/**
 * 仅检查（不修复），返回问题列表
 * 用于调试或干运行（dry-run）
 */
export function checkFiles(files: Record<string, string>): FixResult {
  const engine = createRuleEngine(getBuiltinRules());
  return engine.process(normalizeSandpackFiles(files));
}

/**
 * 打印修复报告到控制台
 */
export function printFixReport(result: FixResult): void {
  if (result.totalIssues === 0) {
    console.log("[AST PostProcess] ✅ 未发现问题");
    return;
  }

  console.log(
    `[AST PostProcess] 发现 ${result.totalIssues} 个问题，修复 ${result.totalFixes} 个 (${result.duration}ms)`,
  );

  for (const [filePath, fileResult] of result.files) {
    if (fileResult.issues.length === 0) continue;
    console.log(`  📄 ${filePath} (${fileResult.issues.length} issues)`);
    for (const issue of fileResult.issues) {
      console.log(`    L${issue.line}:${issue.column} [${issue.rule}] ${issue.message}`);
      if (issue.fixDescription) {
        console.log(`      → ${issue.fixDescription}`);
      }
    }
  }
}

// ===================== 单文件处理 API（前移用） =====================

/** 缓存的规则引擎实例 */
let _cachedEngine: RuleEngine | null = null;

const LOCAL_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];

function toPosixPath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function isLocalModuleSpecifier(importPath: string): boolean {
  return importPath.startsWith(".") || importPath.startsWith("/") || importPath.startsWith("@/");
}

function ensureRelativeImport(importPath: string): string {
  if (!importPath.startsWith(".")) {
    return `./${importPath}`;
  }
  return importPath;
}

function shouldNormalizeImports(fileName: string): boolean {
  return LOCAL_EXTENSIONS.some((extension) => fileName.endsWith(extension));
}

function isCnImport(importPath: string): boolean {
  const normalized = importPath.replace(/\\/g, "/");
  return (
    /(?:^|\/)utils\/cn(?:\.[a-z]+)?$/i.test(normalized) ||
    /^(?:@\/lib\/utils|@\/utils\/cn)(?:\.[a-z]+)?$/i.test(normalized)
  );
}

function buildLibUtilsPath(fileName: string): string {
  const currentDir = path.posix.dirname(toPosixPath(fileName));
  const relativePath = path.posix.relative(currentDir, "/lib/utils.ts");
  return ensureRelativeImport(relativePath);
}

function resolveExistingProjectFile(
  candidatePath: string,
  availableFiles: Set<string>,
): string | null {
  const normalized = candidatePath.replace(/\\/g, "/");

  if (availableFiles.has(normalized)) {
    return normalized;
  }

  const ext = path.posix.extname(normalized);
  const withoutExt = ext ? normalized.slice(0, -ext.length) : normalized;

  for (const extension of LOCAL_EXTENSIONS) {
    const directCandidate = `${withoutExt}${extension}`;
    if (availableFiles.has(directCandidate)) {
      return directCandidate;
    }

    const indexCandidate = path.posix.join(withoutExt, `index${extension}`);
    if (availableFiles.has(indexCandidate)) {
      return indexCandidate;
    }
  }

  return null;
}

function normalizeModuleSpecifier(
  importPath: string,
  fileName: string,
  availableFiles: Set<string>,
): string | null {
  const normalizedImportPath = importPath.replace(/\\/g, "/").trim();
  if (!normalizedImportPath || !isLocalModuleSpecifier(normalizedImportPath)) {
    return null;
  }

  if (isCnImport(normalizedImportPath) && availableFiles.has("/lib/utils.ts")) {
    return buildLibUtilsPath(fileName);
  }

  let targetPath: string;
  if (normalizedImportPath.startsWith("@/")) {
    targetPath = `/${normalizedImportPath.slice(2)}`;
  } else if (normalizedImportPath.startsWith("/")) {
    targetPath = normalizedImportPath;
  } else {
    const currentDir = path.posix.dirname(toPosixPath(fileName));
    targetPath = path.posix.normalize(path.posix.join(currentDir, normalizedImportPath));
  }

  const resolvedTarget = resolveExistingProjectFile(targetPath, availableFiles);
  if (!resolvedTarget) {
    return null;
  }

  const currentDir = path.posix.dirname(toPosixPath(fileName));
  const relativePath = path.posix.relative(currentDir, resolvedTarget);
  return ensureRelativeImport(relativePath);
}

function normalizeImportStatements(
  code: string,
  fileName: string,
  availableFiles: Set<string>,
): string {
  if (!shouldNormalizeImports(fileName)) {
    return code;
  }

  const sourceFile = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") || fileName.endsWith(".jsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const replacements: Array<{ start: number; end: number; text: string }> = [];

  const collectReplacement = (moduleSpecifier: ts.Expression | undefined) => {
    if (!moduleSpecifier || !ts.isStringLiteralLike(moduleSpecifier)) {
      return;
    }

    const normalizedPath = normalizeModuleSpecifier(moduleSpecifier.text, fileName, availableFiles);

    if (!normalizedPath || normalizedPath === moduleSpecifier.text) {
      return;
    }

    const resolvedPath: string = normalizedPath;

    replacements.push({
      start: moduleSpecifier.getStart(sourceFile) + 1,
      end: moduleSpecifier.getEnd() - 1,
      text: resolvedPath,
    });
  };

  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      collectReplacement(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      collectReplacement(node.arguments[0]);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (replacements.length === 0) {
    return code;
  }

  return replacements
    .sort((a, b) => b.start - a.start)
    .reduce((acc, { start, end, text }) => acc.slice(0, start) + text + acc.slice(end), code);
}

export function normalizeSandpackFiles(files: Record<string, string>): Record<string, string> {
  const availableFiles = new Set(Object.keys(files).map(toPosixPath));
  const normalizedFiles: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    const normalizedPath = toPosixPath(filePath);
    normalizedFiles[normalizedPath] = normalizeImportStatements(
      content,
      normalizedPath,
      availableFiles,
    );
  }

  return normalizedFiles;
}

function getEngine(): RuleEngine {
  if (!_cachedEngine) {
    _cachedEngine = createRuleEngine(getBuiltinRules());
  }
  return _cachedEngine;
}

/**
 * 对单个生成的代码文件进行 AST 后处理
 *
 * 适用于在代码生成节点（component/page）内部直接调用，
 * 不需要等到组装阶段再统一处理。
 *
 * @param code - 生成的代码内容
 * @param fileName - 文件路径（如 "/components/NewsList.tsx"）
 * @param typeFiles - 类型文件数组 [{ path: "/types/News.ts", code: "export interface ..." }]
 * @returns 修复后的代码
 */
export function processGeneratedCode(
  code: string,
  fileName: string,
  typeFiles: Array<{ path: string; code?: string; content?: string }>,
): string {
  if (!code || !shouldProcessFile(fileName)) return code;

  try {
    // 将类型文件转为 Record<string, string> 格式供 analyzeTypes 使用
    const filesMap: Record<string, string> = {};
    for (const tf of typeFiles) {
      const content = tf.code || tf.content || "";
      if (content) {
        filesMap[tf.path] = content;
      }
    }
    // 将目标文件也放入（供规则上下文使用）
    filesMap[fileName] = code;

    const normalizedCode = normalizeImportStatements(
      code,
      fileName,
      new Set(Object.keys(filesMap).map(toPosixPath)),
    );

    // 分析类型
    const normalizedFilesMap = {
      ...filesMap,
      [fileName]: normalizedCode,
    };
    const typeAnalysis = analyzeTypes(normalizedFilesMap);

    // 构建上下文
    const context: RuleContext = {
      typeAnalysis,
      allFiles: normalizedFilesMap,
    };

    // 执行修复
    const engine = getEngine();
    const result = engine.fix(normalizedCode, fileName, context);

    if (result.appliedFixes > 0) {
      console.log(`[AST] ${fileName}: 修复 ${result.appliedFixes} 个问题`);
      for (const issue of result.issues) {
        console.log(`  L${issue.line}:${issue.column} [${issue.rule}] ${issue.message}`);
      }
      return result.fixed;
    }

    return normalizedCode;
  } catch (error) {
    // AST 处理失败不阻断生成流程
    console.warn(`[AST] ${fileName}: 处理失败，使用原始代码`, error);
    return code;
  }
}
