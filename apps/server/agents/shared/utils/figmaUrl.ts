/**
 * Figma URL 检测工具（单一来源）
 */

/**
 * Figma URL 正则匹配
 * 支持格式:
 *   https://www.figma.com/file/xxx
 *   https://www.figma.com/design/xxx
 *   https://www.figma.com/proto/xxx
 *   https://www.figma.com/board/xxx
 */
export const FIGMA_URL_REGEX =
  /https?:\/\/([\w.-]+\.)?figma\.com\/(file|design|proto|board)\/[\w-]+[^\s)}\]"]*/i;

/**
 * 从消息列表中提取 Figma URL
 * @returns Figma URL 或 null
 */
export function extractFigmaUrl(messages: any[]): string | null {
  if (!messages || !Array.isArray(messages)) return null;

  // 倒序遍历，优先使用最新消息中的 URL
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // 提取消息文本内容（兼容 string 和 content array 两种格式）
    const content =
      typeof msg?.content === "string"
        ? msg.content
        : Array.isArray(msg?.content)
          ? msg.content.map((c: any) => c.text || "").join(" ")
          : "";

    const match = content.match(FIGMA_URL_REGEX);
    if (match) return match[0];
  }

  return null;
}
