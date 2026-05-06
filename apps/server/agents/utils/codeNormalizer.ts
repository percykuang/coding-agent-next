/**
 * 代码标准化工具
 *
 * 用于修复 LLM 生成代码中常见的格式问题，特别是换行符转义问题。
 * 当 LLM 生成的代码包含字面的 "\\n" 而非真正的换行符时，会导致 Sandpack 解析失败。
 */

/**
 * 修复代码中的转义换行符问题
 *
 * 将字面字符串 "\\n" 替换为真正的换行符 "\n"
 * 同时处理 "\\t" -> "\t" 等常见转义序列
 */
export function normalizeCodeContent(content: string): string {
  if (!content) return content;

  // 检测是否包含字面的 \n（不是真正的换行）
  // 如果代码只有一行且包含 \n 字面量，说明需要修复
  const hasLiteralEscapes =
    content.includes("\\n") || content.includes("\\t") || content.includes('\\"');

  if (!hasLiteralEscapes) {
    return content;
  }

  // 修复常见的转义序列
  const normalized = content
    .replace(/\\n/g, "\n") // 字面 \n -> 真正换行
    .replace(/\\t/g, "\t") // 字面 \t -> 真正制表符
    .replace(/\\"/g, '"') // 字面 \" -> 引号
    .replace(/\\'/g, "'"); // 字面 \' -> 单引号

  return normalized;
}

/**
 * 标准化单个代码文件对象
 * 支持 { content: string } 或 { code: string } 格式
 */
export function normalizeCodeFile<T extends { content?: string; code?: string }>(file: T): T {
  if (!file) return file;

  const result = { ...file };

  if (result.content) {
    result.content = normalizeCodeContent(result.content);
  }

  if (result.code) {
    result.code = normalizeCodeContent(result.code);
  }

  return result;
}

/**
 * 批量标准化代码文件数组
 */
export function normalizeCodeFiles<T extends { content?: string; code?: string }>(files: T[]): T[] {
  if (!files || !Array.isArray(files)) return files;
  return files.map(normalizeCodeFile);
}

/**
 * 标准化 LLM 生成结果
 * 自动检测并处理各种常见的输出格式
 */
export function normalizeLLMResult<T>(result: T): T {
  if (!result || typeof result !== "object") return result;

  const normalized = { ...result } as any;

  // 处理单个 content 字段
  if (normalized.content && typeof normalized.content === "string") {
    normalized.content = normalizeCodeContent(normalized.content);
  }

  // 处理单个 code 字段
  if (normalized.code && typeof normalized.code === "string") {
    normalized.code = normalizeCodeContent(normalized.code);
  }

  // 处理 files 数组 (常见于 utils, types, hooks 等)
  if (normalized.files && Array.isArray(normalized.files)) {
    normalized.files = normalizeCodeFiles(normalized.files);
  }

  // 处理 layoutsCode 数组 (layout 节点)
  if (normalized.layoutsCode && Array.isArray(normalized.layoutsCode)) {
    normalized.layoutsCode = normalizeCodeFiles(normalized.layoutsCode);
  }

  // 处理 componentsCode 数组 (组件节点 - 虽然在 main.graph 中，但保险起见)
  if (normalized.componentsCode && Array.isArray(normalized.componentsCode)) {
    normalized.componentsCode = normalizeCodeFiles(normalized.componentsCode);
  }

  return normalized;
}
