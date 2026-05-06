"use client";

import { Bubble, Sender } from "@ant-design/x";
import { useChat } from "@/hooks/useChat";
import { useChatStore } from "@/store/chatStore";
import type { MessageAttachment } from "@/types/message";
import { Plus, X } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { ENABLE_FIGMA_ROUTE, IMG_UPLOAD_URL } from "@/constants/config";
import { ThoughtChain } from "./ThoughtChain";
import { VersionCard } from "./VersionCard";
import { isFigmaUrl } from "@/types/flow";

type PendingAttachment = Required<Pick<MessageAttachment, "name">> &
  Pick<MessageAttachment, "type" | "url"> & {
    id: string;
  };

const MAX_IMAGE_ATTACHMENTS = 3;

/**
 * ChatPanel (Ant Design X version)
 *
 * 职责：
 * - 使用 antd/x 组件组织 AI Chat UI
 * - 不关心消息如何产生
 * - 不关心 Preview / Sandpack
 */
export function ChatPanel() {
  const { messages, isLoading, sendMessage, stopMessage } = useChat();
  const messageThoughts = useChatStore((state) => state.messageThoughts); // ✨ 获取 thoughts 映射
  const versions = useChatStore((state) => state.versions); // 获取版本历史
  const projectName = useChatStore((state) => state.projectName); // 获取项目名称
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<"info" | "warning" | "error">("info");
  const [inputValue, setInputValue] = useState(""); // ✨ 添加输入框状态
  const figmaNoticeVisible = !ENABLE_FIGMA_ROUTE && isFigmaUrl(inputValue.trim());

  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => {
        setToastMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  const showToast = (msg: string, type: "info" | "warning" | "error" = "info") => {
    setToastMessage(msg);
    setToastType(type);
  };

  const getAttachmentName = (file: File) => {
    if (file.name?.trim()) {
      return file.name;
    }

    const subtype = file.type.split("/")[1] || "png";
    const normalizedSubtype = subtype === "jpeg" ? "jpg" : subtype;
    return `image-${Date.now()}.${normalizedSubtype}`;
  };

  const uploadImageFile = async (file: File): Promise<PendingAttachment> => {
    const formData = new FormData();
    formData.append("file", file, getAttachmentName(file));

    const res = await fetch(IMG_UPLOAD_URL, {
      method: "POST",
      body: formData,
    });

    const payload = await res.json().catch(() => ({ error: "Upload failed", details: "" }));

    if (!res.ok) {
      throw new Error(payload.details || payload.error || "Upload failed");
    }

    const fullUrl = typeof payload.url === "string" && payload.url.trim() ? payload.url : "";

    if (!fullUrl) {
      throw new Error("Upload succeeded but no file URL was returned");
    }

    return {
      id: crypto.randomUUID(),
      url: fullUrl,
      name: (typeof payload.name === "string" && payload.name.trim()) || getAttachmentName(file),
      type: "image",
    };
  };

  const appendImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (imageFiles.length === 0) {
      showToast("仅支持上传或粘贴图片", "warning");
      return;
    }

    if (imageFiles.length !== files.length) {
      showToast("已忽略非图片文件，仅保留图片附件", "warning");
    }

    const remainingSlots = MAX_IMAGE_ATTACHMENTS - attachedFiles.length;
    if (remainingSlots <= 0) {
      showToast(`最多只能上传 ${MAX_IMAGE_ATTACHMENTS} 张图片`, "warning");
      return;
    }

    const filesToUpload = imageFiles.slice(0, remainingSlots);
    if (filesToUpload.length < imageFiles.length) {
      showToast(`最多只能上传 ${MAX_IMAGE_ATTACHMENTS} 张图片`, "warning");
    }

    setIsUploading(true);
    const uploadedFiles: PendingAttachment[] = [];

    try {
      for (const file of filesToUpload) {
        const uploaded = await uploadImageFile(file);
        uploadedFiles.push(uploaded);
      }

      if (uploadedFiles.length > 0) {
        setAttachedFiles((prev) => [...prev, ...uploadedFiles]);
      }
    } catch (err) {
      console.error("Upload error:", err);
      showToast(err instanceof Error ? err.message : "图片上传失败，请重试", "error");
    } finally {
      setIsUploading(false);
    }
  };

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, isLoading, attachedFiles]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";

    if (files.length === 0) {
      return;
    }

    await appendImageFiles(files);
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const senderActionButtonClassName =
    "!h-8 !w-8 !cursor-pointer !rounded-full !border !border-black !bg-black !p-0 !text-white shadow-sm transition-colors hover:!border-gray-800 hover:!bg-gray-800 disabled:!cursor-not-allowed disabled:!border-gray-200 disabled:!bg-gray-200 disabled:!text-gray-400";
  const senderStopButtonClassName =
    "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-black bg-black p-0 text-white shadow-sm transition-colors hover:border-gray-800 hover:bg-gray-800 disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-200 disabled:text-gray-400";

  return (
    <div className="relative flex h-full flex-col">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="animate-in fade-in slide-in-from-top-2 absolute top-4 left-1/2 z-50 -translate-x-1/2 duration-300">
          <div
            className={`rounded-lg px-4 py-2.5 text-sm text-white shadow-lg ${
              toastType === "warning"
                ? "bg-orange-500"
                : toastType === "error"
                  ? "bg-red-500"
                  : "bg-gray-800"
            }`}
          >
            {toastMessage}
          </div>
        </div>
      )}

      {/* Fullscreen Image Preview */}
      {previewImage && (
        <div
          className="animate-in fade-in fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-8 backdrop-blur-sm duration-200"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-12 right-0 p-2 text-white/70 transition-colors hover:text-white"
            >
              <X size={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewImage}
              alt="Preview"
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        hidden
        accept="image/*"
        multiple
        onChange={handleFileSelect}
      />

      {/* Chat messages */}

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3">
        {messages.map((msg) => (
          <div key={msg.id} className="mb-4">
            {/* 只在消息有内容或附件时才显示 Bubble */}
            {(msg.content || msg.attachments?.length) && (
              <Bubble.List
                items={[
                  {
                    key: msg.id,
                    role: msg.role === "user" ? "user" : "model",
                    placement: msg.role === "user" ? "end" : "start",
                    // 图片预览需要使用 content 属性传入 ReactNode
                    content: (
                      <div className="flex flex-col gap-2">
                        {msg.attachments?.map((att) => {
                          return (
                            <div
                              key={att.url}
                              className="max-w-[300px] overflow-hidden rounded-xl border border-gray-200 bg-white"
                            >
                              <div
                                className="cursor-zoom-in transition-opacity hover:opacity-95"
                                onClick={() => setPreviewImage(att.url)}
                              >
                                <Image
                                  src={att.url}
                                  alt={att.name || "attachment"}
                                  width={0}
                                  height={0}
                                  sizes="100vw"
                                  style={{ width: "100%", height: "auto" }}
                                  unoptimized
                                />
                              </div>
                              {att.name && (
                                <div className="truncate border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
                                  {att.name}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="whitespace-pre-wrap">{msg.content}</div>
                      </div>
                    ),
                  },
                ]}
              />
            )}

            {/* Thought Chain Display - 仅为assistant消息显示 */}
            {msg.role === "assistant" &&
              messageThoughts[msg.id] &&
              messageThoughts[msg.id].length > 0 && (
                <div className="mt-2 flex justify-start pl-2">
                  <ThoughtChain thoughts={messageThoughts[msg.id]} />
                </div>
              )}

            {/* Version Card Display - 为每个assistant消息显示对应版本 */}
            {msg.role === "assistant" &&
              (() => {
                // 获取所有assistant消息
                const assistantMessages = messages.filter((m) => m.role === "assistant");
                // 找到当前消息在assistant消息列表中的索引
                const messageIndex = assistantMessages.findIndex((m) => m.id === msg.id);
                // 获取对应索引的版本
                const correspondingVersion = versions[messageIndex];

                // 如果找到了对应的版本，显示版本卡片
                if (correspondingVersion) {
                  return (
                    <div className="mt-2 w-full px-2">
                      <VersionCard version={correspondingVersion} projectName={projectName} />
                    </div>
                  );
                }
                return null;
              })()}
          </div>
        ))}
      </div>

      {/* Prompt input */}
      <div className="shrink-0 border-t border-gray-200 p-2">
        {figmaNoticeVisible && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            检测到 Figma 链接。当前线上 Beta 暂不支持 Figma 直连转码，请改用截图或文字描述继续生成。
          </div>
        )}
        <Sender
          value={inputValue}
          onChange={setInputValue}
          onPasteFile={(files) => {
            void appendImageFiles(Array.from(files));
          }}
          header={
            attachedFiles.length > 0 ? (
              <div className="flex flex-wrap gap-2 px-1 py-1">
                {attachedFiles.map((file) => (
                  <div
                    key={file.id}
                    className="group flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-700"
                  >
                    <button
                      type="button"
                      className="shrink-0 cursor-zoom-in overflow-hidden rounded-full"
                      onClick={() => setPreviewImage(file.url)}
                    >
                      <Image
                        src={file.url}
                        alt={file.name}
                        width={24}
                        height={24}
                        className="h-6 w-6 rounded-full object-cover"
                        unoptimized
                      />
                    </button>
                    <span className="max-w-[180px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachment(file.id)}
                      className="rounded-full p-0.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
                      aria-label={`移除 ${file.name}`}
                      title={`移除 ${file.name}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              false
            )
          }
          prefix={
            <button
              type="button"
              className="cursor-pointer rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-not-allowed"
              onClick={() => {
                if (attachedFiles.length >= MAX_IMAGE_ATTACHMENTS) {
                  showToast(`最多只能上传 ${MAX_IMAGE_ATTACHMENTS} 张图片`, "warning");
                  return;
                }

                fileInputRef.current?.click();
              }}
              disabled={isUploading}
            >
              {isUploading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
              ) : (
                <Plus size={18} />
              )}
            </button>
          }
          suffix={(_, { components }) => {
            const { SendButton } = components;

            return isLoading ? (
              <button
                type="button"
                onClick={stopMessage}
                className={senderStopButtonClassName}
                aria-label="停止生成"
                title="停止生成"
              >
                <span className="h-2 w-2 rounded-[2px] bg-current" />
              </button>
            ) : (
              <SendButton className={senderActionButtonClassName} />
            );
          }}
          placeholder={
            attachedFiles.length > 0 ? "为这张图片补充你的需求..." : "今天你想构建什么样的应用？"
          }
          loading={isLoading}
          onCancel={stopMessage}
          onSubmit={(value) => {
            if (!value?.trim() && attachedFiles.length === 0) return;

            // Map ui attachments to message attachments
            const msgAttachments = attachedFiles.map((f) => ({
              type: "image" as const,
              url: f.url,
              name: f.name,
            }));

            sendMessage(value || " ", msgAttachments.length > 0 ? msgAttachments : undefined);

            // Clear attachments and input
            setAttachedFiles([]);
            setInputValue(""); // ✨ 清空输入框
          }}
        />
      </div>
    </div>
  );
}
