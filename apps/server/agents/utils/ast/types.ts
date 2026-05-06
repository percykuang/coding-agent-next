/**
 * AST 后处理系统 - 核心类型定义
 *
 * 定义 AST 分析和修复过程中使用的所有接口和类型
 */

/**
 * 类型字段元信息
 * 从 types/*.ts 中提取的字段信息
 */
export interface FieldMeta {
  /** 字段名 */
  name: string;
  /** 是否是对象类型（非原始类型） */
  isObject: boolean;
  /** 类型名称（如 string, Author, Category） */
  typeName: string;
  /** 是否是数组类型 */
  isArray: boolean;
  /** 对象类型的子属性列表 */
  properties: string[];
  /** 推荐访问的属性（通常是 name 或 title） */
  suggestedProperty: string | null;
}

/**
 * 接口/类型元信息
 * 表示一个完整的 interface 或 type 定义
 */
export interface TypeMeta {
  /** 类型名称（如 Article, Author） */
  name: string;
  /** 所有字段的元信息 */
  fields: Map<string, FieldMeta>;
}

/**
 * 类型分析结果
 */
export interface TypeAnalysisResult {
  /** 所有类型定义 */
  types: Map<string, TypeMeta>;
  /** 所有对象类型字段名的集合（跨类型汇总） */
  objectFields: Map<string, FieldMeta>;
}

/**
 * AST 检查发现的问题
 */
export interface ASTIssue {
  /** 问题类型标识 */
  type: string;
  /** 规则名称 */
  rule: string;
  /** 文件路径 */
  file: string;
  /** 行号 */
  line: number;
  /** 列号 */
  column: number;
  /** 问题描述 */
  message: string;
  /** 修复描述 */
  fixDescription?: string;
}

/**
 * AST 规则接口
 */
export interface ASTRule {
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 检查函数：扫描源文件，返回发现的问题 */
  check(code: string, fileName: string, context: RuleContext): ASTIssue[];
  /** 修复函数：修复源代码中的问题，返回修复后的代码 */
  fix(code: string, fileName: string, issues: ASTIssue[], context: RuleContext): string;
}

/**
 * 规则执行上下文
 * 携带类型分析的结果，供规则动态使用
 */
export interface RuleContext {
  /** 类型分析结果 */
  typeAnalysis: TypeAnalysisResult;
  /** 所有文件内容 */
  allFiles: Record<string, string>;
}

/**
 * 单个文件的修复结果
 */
export interface FileFixResult {
  /** 文件路径 */
  file: string;
  /** 原始代码 */
  original: string;
  /** 修复后的代码 */
  fixed: string;
  /** 发现的问题 */
  issues: ASTIssue[];
  /** 成功应用的修复数量 */
  appliedFixes: number;
}

/**
 * 整体修复结果
 */
export interface FixResult {
  /** 所有文件的修复结果 */
  files: Map<string, FileFixResult>;
  /** 发现的总问题数 */
  totalIssues: number;
  /** 成功修复的总数 */
  totalFixes: number;
  /** 处理耗时(ms) */
  duration: number;
}
