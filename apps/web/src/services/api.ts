// API 请求封装
import { API_BASE_URL } from "@/constants/config";
import { ChatMessage } from "@/types/message";
import { StreamEvent } from "@/types/api";

function createAbortError(): DOMException {
  return new DOMException("The user aborted a request.", "AbortError");
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function getReactTS_Template(): Promise<Record<string, { code: string }>> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}/template/react-ts`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch template (status ${response.status})`);
      }

      return response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Failed to fetch template");

      if (attempt < 3) {
        await sleep(attempt * 300);
      }
    }
  }

  throw lastError ?? new Error("Failed to fetch template");
}

/**
 * generateApp (Stream)
 *
 * 调用后端 /api/chat 接口 (SSE模式)
 * 职责：
 * - 发送对话上下文和项目 ID
 * - 处理 SSE 流式响应，回调 onChunk 更新状态
 */
export async function generateAppStream(
  params: {
    messages: ChatMessage[];
    projectId?: string;
    existingFiles?: Record<string, string>;
  },
  onChunk: (event: StreamEvent) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  try {
    if (options?.signal?.aborted) {
      throw createAbortError();
    }

    const response = await fetch(`${API_BASE_URL}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        messages: params.messages,
        projectId: params.projectId, // 传递项目 ID
        existingFiles: params.existingFiles,
      }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    const cancelReader = () => {
      void reader.cancel().catch(() => {});
    };
    const readChunk = async () => {
      const signal = options?.signal;

      if (!signal) {
        return reader.read();
      }

      if (signal.aborted) {
        throw createAbortError();
      }

      return new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          reject(createAbortError());
        };

        signal.addEventListener("abort", onAbort, { once: true });

        void reader.read().then(
          (result) => {
            signal.removeEventListener("abort", onAbort);
            resolve(result);
          },
          (error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
          },
        );
      });
    };

    options?.signal?.addEventListener("abort", cancelReader, { once: true });

    try {
      while (true) {
        const { done, value } = await readChunk();
        if (done) break;

        // 解码当前块
        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // 处理 buffer 中的完整行 (SSE 以 \n\n 分隔)
        const lines = buffer.split("\n\n");
        // 保留最后一个可能不完整的部分存回 buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6).trim();
            if (!jsonStr) continue;

            try {
              const event = JSON.parse(jsonStr);
              console.log("[Stream] Parsed event:", event.type);

              try {
                onChunk(event);
              } catch (e) {
                console.warn("Failed to handle SSE message:", event, e);
              }
            } catch (e) {
              console.warn("Failed to parse SSE message:", jsonStr, e);
            }
          }
        }
      }

      if (options?.signal?.aborted) {
        throw createAbortError();
      }
    } finally {
      options?.signal?.removeEventListener("abort", cancelReader);
    }
  } catch (error) {
    if (
      (error instanceof DOMException && error.name === "AbortError") ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw error;
    }

    console.error("Stream error:", error);
    onChunk({
      type: "error",
      data: {
        message: error instanceof Error ? error.message : "Network error",
      },
    });
  }
}

/**
 * generateApp (Legacy) - 已废弃，提醒迁移
 */
export async function generateApp(): Promise<{ message: string }> {
  throw new Error("generateApp is deprecated. Use generateAppStream instead.");
}
