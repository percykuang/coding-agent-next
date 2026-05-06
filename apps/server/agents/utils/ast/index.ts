/**
 * AST 后处理系统 - 总入口
 *
 * 动态分析类型定义 → 生成检查规则 → 扫描生成代码 → 自动修复问题
 *
 * ┌─────────────────────────────────────────────────┐
 * │                    AST Pipeline                  │
 * │                                                  │
 * │  types/*.ts ──→ TypeAnalyzer ──→ FieldMeta[]    │
 * │                                      │           │
 * │                                      ▼           │
 * │  *.tsx ───────→ Parser ──→ RuleEngine ──→ Fix   │
 * │                              │                   │
 * │                    ┌─────────┼──────────┐        │
 * │                    ▼         ▼          ▼        │
 * │              objectRendering  safeAccess  ...    │
 * └─────────────────────────────────────────────────┘
 *
 * 使用方式：
 *   import { postProcessFiles } from "./ast";
 *   const { files, result } = postProcessFiles(sandpackFiles);
 */

// 核心 API
export { postProcessFiles, checkFiles, printFixReport, processGeneratedCode } from "./fixer.js";

// 类型
export type {
  ASTIssue,
  ASTRule,
  RuleContext,
  FieldMeta,
  TypeMeta,
  TypeAnalysisResult,
  FileFixResult,
  FixResult,
} from "./types.js";

// 子模块（供扩展规则使用）
export { analyzeTypes } from "./typeAnalyzer.js";
export { RuleEngine, createRuleEngine } from "./ruleEngine.js";
export { getBuiltinRules } from "./rules/index.js";
export * as parser from "./parser.js";
