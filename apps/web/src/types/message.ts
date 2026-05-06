// 消息类型定义
export type MessageRole = "user" | "assistant";

export interface MessageAttachment {
  type: "image";
  url: string;
  id?: string;
  name?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  attachments?: MessageAttachment[];
}
