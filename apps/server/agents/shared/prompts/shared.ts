/**
 * 通用提示词片段
 * 用于在各个节点的 System Prompt 中复用
 */

/**
 * JSON 安全输出提示词
 * 强调 LLM 必须生成严格合法的 JSON
 */
export const JSON_SAFETY_PROMPT = `
【JSON 输出安全规则 - 必须严格遵守】
0. **纯 JSON 输出**: 只输出 JSON 数据本身，JSON 前后禁止添加任何文字、解释、markdown 代码块标记或注释。
1. 输出必须是严格合法的 JSON 格式，能够被 JSON.parse() 正确解析。
2. 所有字符串值必须使用双引号 (") 包裹，禁止使用单引号。
3. 对象的最后一个属性后禁止添加逗号 (trailing comma)。
4. 数组的最后一个元素后禁止添加逗号。
5. 所有括号必须正确配对：{ } 和 [ ] 必须成对出现。
6. 字符串内的特殊字符必须正确转义：
   - 换行符使用 \\n
   - 双引号使用 \\"
   - 反斜杠使用 \\\\
   - Tab 使用 \\t
7. 禁止在 JSON 中添加注释 (// 或 /* */)。
8. 数值类型不能用引号包裹，布尔值使用 true/false (小写)。
9. 生成完成后，请在脑内验证 JSON 结构的完整性。
`;

/**
 * 将 JSON 安全提示词追加到现有 System Prompt
 */
export const appendJsonSafety = (prompt: string): string => {
  return `${prompt}\n${JSON_SAFETY_PROMPT}`;
};
