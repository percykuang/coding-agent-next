/**
 * 路由层适配器共享工具函数
 */

export function getLastMessage(messages: any[]): any {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  return messages[messages.length - 1];
}

export function getLastText(messages: any[]): string {
  const lastMsg = getLastMessage(messages);
  return typeof lastMsg?.content === "string" ? lastMsg.content : "";
}

export function hasImageAttachment(messages: any[]): boolean {
  const lastMsg = getLastMessage(messages);
  const attachments = Array.isArray(lastMsg?.attachments) ? lastMsg.attachments : [];
  return attachments.some((att: any) => att.type === "image" && att.url);
}

/**
 * 避免“只发了链接”被误判为普通文本 prompt；只有去掉链接后仍有文字内容，才算 prompt 请求。
 * @param messages
 * @returns
 */
// 判断最后一条消息是否包含文本提示（去除URL链接后）
export function hasTextPrompt(messages: any[]): boolean {
  // 取最后一条消息文本
  const content = getLastText(messages);
  // 去除URL链接后的文本长度
  const textWithoutUrls = content.replace(/https?:\/\/\S+/g, "").trim();
  // 如果去除URL后的文本长度大于0，说明有文本提示
  return textWithoutUrls.length > 0;
}

export function isModificationRequest(messages: any[]): boolean {
  const content = getLastText(messages).toLowerCase();
  if (!content) return false;
  const keywords = [
    "modify",
    "update",
    "refactor",
    "change",
    "修改",
    "改一下",
    "优化",
    "重构",
    "在现有",
    "基于当前",
  ];
  return keywords.some((k) => content.includes(k));
}
