// 聊天相关自定义 Hook
"use client";

import { useCallback, useRef } from "react";
import { ChatMessage } from "@/types/message";
import type { MessageAttachment } from "@/types/message";
import { generateAppStream } from "@/services/api";
import { useChatStore } from "@/store/chatStore";
import { useSandpackStore } from "@/store/sandpackStore";
import { StreamEventType } from "@/types/api";
import type { FlowType } from "@/types/flow";
import { isFigmaUrl } from "@/types/flow";
import { FLOW_CONFIG, NEXT_STEP_MAP, STEP_DEFINITIONS, getPhaseByNode } from "@/constants/chat";

/**
 * useChat
 *
 * Chat 领域唯一入口
 * - 管理消息状态
 * - 触发生成
 * - 维护 loading / streaming
 * - 接收 files 事件并更新 Sandpack
 */
export function useChat() {
  const {
    messages,
    isLoading,
    addMessage,
    setLoading,
    addThought,
    updateThought,
    archiveThoughts,
    updatePhaseProgress,
    collapsePhase,
    updateProjectName, // 获取更新项目名称的方法
    incrementVersion, // 递增版本号
    getCurrentThreadId, // 获取当前版本的 threadId
    saveVersion, // 保存版本快照
    setCurrentFlow, // 设置当前流程类型
  } = useChatStore();

  const { setGeneratedFiles, setIsAssembling } = useSandpackStore();
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeAssistantIdRef = useRef<string | null>(null);

  const getThoughtDetails = (
    type: StreamEventType,
    status: "pending" | "success" | "error" | "cancelled",
    data?: unknown,
  ) => {
    const config = STEP_DEFINITIONS[type];

    if (!config) {
      return {
        title: "处理中",
        description: "AI 正在思考...",
      };
    }

    let descriptionStr = "";
    if (status === "pending") {
      descriptionStr = config.description.pending;
    } else {
      const successDesc = config.description.success;
      descriptionStr = typeof successDesc === "function" ? successDesc(data) : successDesc;
    }

    return {
      title: config.title,
      description: descriptionStr,
    };
  };

  const stopMessage = useCallback(() => {
    const controller = abortControllerRef.current;
    if (!controller || controller.signal.aborted) return;

    const assistantId = activeAssistantIdRef.current;
    if (assistantId) {
      const currentThoughts = useChatStore.getState().messageThoughts[assistantId] || [];
      const pendingThought = [...currentThoughts]
        .reverse()
        .find((thought) => thought.status === "pending");

      if (pendingThought) {
        updateThought(assistantId, pendingThought.key, {
          status: "cancelled",
          description: "已停止生成",
          content: "已停止生成",
        });
      }
    }

    setIsAssembling(false);
    setLoading(false);
    abortControllerRef.current = null;
    controller.abort();
  }, [setIsAssembling, setLoading, updateThought]);

  /**
   * 发送用户消息，并触发 AI 生成
   */
  const sendMessage = useCallback(
    async (content: string, attachments?: MessageAttachment[]) => {
      // Guard: 防止重复提交
      if (useChatStore.getState().isLoading) return;

      // 版本管理：判断是创建还是编辑
      const isEditing = messages.some((m) => m.role === "assistant");
      const operation: "create" | "edit" = isEditing ? "edit" : "create";

      // 递增版本号
      const newVersion = incrementVersion();
      const threadId = getCurrentThreadId();
      const currentWorkspaceFiles = useSandpackStore.getState().workspaceFiles;
      const existingFiles = currentWorkspaceFiles
        ? Object.fromEntries(
            Object.entries(currentWorkspaceFiles).map(([path, file]) => [path, file.code]),
          )
        : undefined;

      console.log(`[useChat] ${operation === "create" ? "Creating" : "Editing"} project:`, {
        version: newVersion,
        threadId,
        operation,
        existingFileCount: existingFiles ? Object.keys(existingFiles).length : 0,
      });

      // 1. 构造并添加用户消息
      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        attachments,
      };

      // 获取当前完整的消息历史 (Store中的 + 当前这一条)
      const currentHistory = [...useChatStore.getState().messages, userMessage];

      addMessage(userMessage);

      // 2. 初始化状态
      setLoading(true);

      // ✨ 归档上一次的思维链（找到最后一个 assistant 消息）
      const previousMessages = useChatStore.getState().messages;
      const lastAssistantMsg = [...previousMessages].reverse().find((m) => m.role === "assistant");
      if (lastAssistantMsg) {
        archiveThoughts(lastAssistantMsg.id);
      }

      // ✨ 立即创建一个 assistant 消息来承载思维链
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "", // 内容后续通过 streaming 填充
      };
      const assistantId = assistantMessage.id; // ✨ 保存 ID 用于后续操作
      activeAssistantIdRef.current = assistantId;
      addMessage(assistantMessage);

      // ✨ 流程类型识别：检测用户输入是否包含 Figma 链接
      const flowType: FlowType = isFigmaUrl(content) ? "figma" : "traditional";
      setCurrentFlow(flowType);

      // ✨ 使用流程配置的初始步骤
      const initialType = FLOW_CONFIG[flowType].initialStep;

      console.log(`[useChat] Flow: ${flowType}, Initial Step: ${initialType}`);

      const initialDetails = getThoughtDetails(initialType as StreamEventType, "pending");
      const initialPhase = getPhaseByNode(initialType as StreamEventType);
      addThought(assistantId, {
        // 传入 messageId
        key: initialType,
        type: "node", // 标记为节点级
        phase: initialPhase,
        title: initialDetails.title,
        description: initialDetails.description,
        status: "pending",
      });

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        // 3. 调用流式接口，传递版本化的 threadId
        await generateAppStream(
          {
            messages: currentHistory,
            projectId: threadId, // ✅ 使用版本化的 threadId
            existingFiles,
          },
          (event) => {
            const { type, data } = event;
            console.log("[useChat] Stream Event:", type);

            if (type === "done") return;

            if (type === "error") {
              const errorEvent = event as {
                data?: { message?: string };
                message?: string;
              };
              const errorMessage = errorEvent.data?.message || errorEvent.message || "未知错误";

              const currentThoughts = useChatStore.getState().messageThoughts[assistantId] || [];
              const pendingThought = [...currentThoughts]
                .reverse()
                .find((thought) => thought.status === "pending");

              if (pendingThought) {
                updateThought(assistantId, pendingThought.key, {
                  status: "error",
                  description: errorMessage,
                  content: errorMessage,
                });
              } else {
                addThought(assistantId, {
                  // 传入 messageId
                  key: `error-${Date.now()}`,
                  title: "发生错误",
                  description: errorMessage,
                  status: "error",
                });
              }
              return;
            }

            // 特殊处理：files / figmaAssembly 事件 - 更新 Sandpack 并保存版本快照
            if (type === "files" || type === "figmaAssembly") {
              const filesPayload =
                data && typeof data === "object"
                  ? (data as { files?: Record<string, string> })
                  : undefined;

              if (filesPayload?.files) {
                const nextFiles = filesPayload.files;
                console.log("[useChat] Setting generated files:", Object.keys(nextFiles).length);
                setGeneratedFiles(nextFiles);

                // ✅ 保存版本快照
                saveVersion({
                  versionNumber: newVersion,
                  threadId: threadId,
                  operation: operation,
                  prompt: content,
                  timestamp: Date.now(),
                  files: nextFiles,
                  fileCount: Object.keys(nextFiles).length,
                  changes: existingFiles
                    ? {
                        added: Object.keys(nextFiles).filter((path) => !(path in existingFiles)),
                        modified: Object.keys(nextFiles).filter(
                          (path) =>
                            path in existingFiles && existingFiles[path] !== nextFiles[path],
                        ),
                        deleted: Object.keys(existingFiles).filter((path) => !(path in nextFiles)),
                      }
                    : undefined,
                });

                console.log("[useChat] Version saved:", {
                  version: newVersion,
                  operation,
                  fileCount: Object.keys(nextFiles).length,
                });
              }
            }

            // 特殊处理：intent 事件 - 更新项目名称
            if (type === "intent") {
              const intentPayload =
                data && typeof data === "object"
                  ? (data as {
                      product?: { name?: string };
                    })
                  : undefined;

              if (intentPayload?.product?.name) {
                console.log("[useChat] Updating project name:", intentPayload.product.name);
                updateProjectName(intentPayload.product.name);
              }
            }

            // 核心逻辑修正：
            // 收到 event type (如 "analysis") 代表该步骤已完成
            // 1. 更新当前步骤为完成
            // 2. 开启下一个步骤为 pending

            const currentStepDetails = getThoughtDetails(type as StreamEventType, "success", data);

            // 更新当前步骤状态
            updateThought(assistantId, type, {
              // ✨ 传入 messageId
              status: "success",
              description: currentStepDetails.description,
              content: JSON.stringify(data, null, 2),
            });

            // 阶段聚合逻辑：更新阶段进度并检测是否需要折叠
            const currentPhase = getPhaseByNode(type as StreamEventType);
            if (currentPhase) {
              updatePhaseProgress(currentPhase);

              // 检测阶段是否完成
              const phaseInfo = useChatStore.getState().phaseCompletion[currentPhase];
              if (phaseInfo && phaseInfo.completed === phaseInfo.total) {
                // 阶段完成，触发折叠
                collapsePhase(assistantId, currentPhase); // ✨ 传入 messageId
              }
            }

            // 查找并启动下一个步骤
            const nextType = NEXT_STEP_MAP[type];
            if (nextType && nextType !== "done") {
              // 如果下一个步骤是 app（应用组装），设置组装状态
              if (nextType === "app") {
                setIsAssembling(true);
              }

              const nextDetails = getThoughtDetails(nextType as StreamEventType, "pending");
              const nextPhase = getPhaseByNode(nextType as StreamEventType);
              addThought(assistantId, {
                // ✨ 传入 messageId
                key: nextType,
                type: "node", // 标记为节点级
                phase: nextPhase,
                title: nextDetails.title,
                description: nextDetails.description,
                status: "pending",
              });
            }
          },
          { signal: abortController.signal },
        );
      } catch (error) {
        if (
          (error instanceof DOMException && error.name === "AbortError") ||
          (error instanceof Error && error.name === "AbortError")
        ) {
          console.info("[useChat] Generation aborted by user");

          const currentThoughts = useChatStore.getState().messageThoughts[assistantId] || [];
          const pendingThought = [...currentThoughts]
            .reverse()
            .find((thought) => thought.status === "pending");

          if (pendingThought) {
            updateThought(assistantId, pendingThought.key, {
              status: "cancelled",
              description: "已停止生成",
              content: "已停止生成",
            });
          } else {
            addThought(assistantId, {
              key: `cancel-${Date.now()}`,
              title: "已停止生成",
              description: "本次生成已被手动终止",
              status: "cancelled",
            });
          }

          setIsAssembling(false);
          return;
        }

        console.error("Generate App Error:", error);
        addThought(assistantId, {
          // ✨ 传入 messageId
          key: `error-${Date.now()}`,
          title: "发生错误",
          description: error instanceof Error ? error.message : "未知错误",
          status: "error",
        });
      } finally {
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        if (activeAssistantIdRef.current === assistantId) {
          activeAssistantIdRef.current = null;
        }
        setLoading(false);
      }
    },
    [
      addMessage,
      setLoading,
      archiveThoughts,
      addThought,
      updateThought,
      updatePhaseProgress,
      collapsePhase,
      setGeneratedFiles,
      setIsAssembling,
      messages, // 用于判断是否为编辑操作
      incrementVersion, // 版本管理
      getCurrentThreadId, // 版本管理
      saveVersion, // 版本管理
      updateProjectName, // 项目名称更新
      setCurrentFlow, // 流程类型设置
    ],
  );

  return {
    messages,
    isLoading,
    sendMessage,
    stopMessage,
  };
}
