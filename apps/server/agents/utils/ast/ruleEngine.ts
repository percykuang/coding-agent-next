/**
 * 规则引擎
 *
 * 管理和执行 AST 检查/修复规则。
 * 支持规则注册、批量执行、结果收集。
 */

import type { ASTRule, ASTIssue, RuleContext, FileFixResult, FixResult } from "./types.js";
import { shouldProcessFile } from "./parser.js";
import { analyzeTypes } from "./typeAnalyzer.js";

export class RuleEngine {
  private rules: ASTRule[] = [];

  /**
   * 注册一条规则
   */
  register(rule: ASTRule): void {
    this.rules.push(rule);
  }

  /**
   * 批量注册规则
   */
  registerAll(rules: ASTRule[]): void {
    this.rules.push(...rules);
  }

  /**
   * 获取已注册的规则列表
   */
  getRules(): ASTRule[] {
    return [...this.rules];
  }

  /**
   * 对单个文件执行所有规则检查
   */
  check(code: string, fileName: string, context: RuleContext): ASTIssue[] {
    const allIssues: ASTIssue[] = [];

    for (const rule of this.rules) {
      try {
        const issues = rule.check(code, fileName, context);
        allIssues.push(...issues);
      } catch (err) {
        console.warn(`[AST] Rule "${rule.name}" check failed on ${fileName}:`, err);
      }
    }

    return allIssues;
  }

  /**
   * 对单个文件执行所有规则的修复
   */
  fix(code: string, fileName: string, context: RuleContext): FileFixResult {
    let currentCode = code;
    const allIssues: ASTIssue[] = [];
    let appliedFixes = 0;

    for (const rule of this.rules) {
      try {
        // 先检查
        const issues = rule.check(currentCode, fileName, context);
        if (issues.length === 0) continue;

        allIssues.push(...issues);

        // 再修复
        const fixedCode = rule.fix(currentCode, fileName, issues, context);

        if (fixedCode !== currentCode) {
          appliedFixes += issues.length;
          currentCode = fixedCode;
        }
      } catch (err) {
        console.warn(`[AST] Rule "${rule.name}" fix failed on ${fileName}:`, err);
      }
    }

    return {
      file: fileName,
      original: code,
      fixed: currentCode,
      issues: allIssues,
      appliedFixes,
    };
  }

  /**
   * 对所有文件执行检查和修复
   *
   * @param files - Sandpack 文件集合 Record<string, string>
   * @returns FixResult - 修复结果
   */
  process(files: Record<string, string>): FixResult {
    const start = Date.now();

    // 1. 分析类型
    const typeAnalysis = analyzeTypes(files);

    // 2. 构建上下文
    const context: RuleContext = {
      typeAnalysis,
      allFiles: files,
    };

    // 3. 遍历每个文件
    const fileResults = new Map<string, FileFixResult>();
    let totalIssues = 0;
    let totalFixes = 0;

    for (const [filePath, content] of Object.entries(files)) {
      if (!shouldProcessFile(filePath)) continue;

      const result = this.fix(content, filePath, context);
      fileResults.set(filePath, result);
      totalIssues += result.issues.length;
      totalFixes += result.appliedFixes;
    }

    return {
      files: fileResults,
      totalIssues,
      totalFixes,
      duration: Date.now() - start,
    };
  }

  /**
   * 生成修复后的文件集合（直接替换原文件内容）
   */
  processAndApply(files: Record<string, string>): {
    files: Record<string, string>;
    result: FixResult;
  } {
    const result = this.process(files);
    const updatedFiles = { ...files };

    for (const [filePath, fixResult] of result.files) {
      if (fixResult.appliedFixes > 0) {
        updatedFiles[filePath] = fixResult.fixed;
      }
    }

    return { files: updatedFiles, result };
  }
}

/**
 * 创建预配置的规则引擎
 * 注册所有内置规则
 */
export function createRuleEngine(rules: ASTRule[]): RuleEngine {
  const engine = new RuleEngine();
  engine.registerAll(rules);
  return engine;
}
