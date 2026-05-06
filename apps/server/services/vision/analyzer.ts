/**
 * Vision API 分析器
 * 分析上传的图片设计稿，并提炼为后续节点可复用的文本上下文
 */

import fs from "fs/promises";
import path from "path";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { getVisionModel, getVisionModelProvider } from "../../agents/utils/model.js";
import {
  coerceString,
  coerceStringArray,
  parseLlmOutputObject,
} from "../../agents/utils/providerOutputRecovery.js";
import { withRetry } from "../../agents/utils/retry.js";
import { resolveFromAppRoot } from "../../utils/runtimePaths.js";
import type { VisionAnalysisInput, VisionAnalysisResult } from "./types.js";

type VisionContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

const LOCAL_UPLOAD_ROUTE_PREFIX = "/api/upload/files/";
const DEFAULT_IMAGE_MIME_TYPE = "image/png";

const EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
};

const SCREENSHOT_REPLICA_KEYWORDS = [
  "仿照",
  "照着",
  "参考这个图",
  "参考上图",
  "按这个图做",
  "按图做",
  "复刻",
  "还原",
  "照这个页面",
  "模仿这个页面",
];

const VISION_SYSTEM_PROMPT = `
你是资深 UI/UX 设计分析师。
你的任务是分析用户上传的界面截图、网页截图或设计稿，提炼出可直接用于前端代码生成的关键信息。

输出要求：
1. 只返回 JSON 对象，不要附带 Markdown、解释或代码块。
2. JSON 必须包含以下字段：
   - summary: string，总结页面/界面的整体目标和视觉特征。必须显式说明：
     * 任务判断（截图复刻 / 设计参考 / 后台系统 / 落地页 / 搜索首页等）
     * 页面形态（优先单页 / 多页 / 工作台）
     * 保真要求（高保真还原 / 可提炼风格）
   - layout: string[]，描述页面结构与区块布局
   - components: string[]，列出关键组件和可识别的 UI 元素
   - style: string[]，列出配色、字体、间距、圆角、阴影、密度、风格倾向等
   - interactionHints: string[]，列出能从图片推断出的交互线索、状态变化或动态行为
3. 关注真实可实现的前端细节，避免空泛形容词。
4. 如果有多张图片，综合分析它们之间的共性与差异。
5. 如果某些内容无法从图中确定，不要臆造。
6. 如果用户文字表达了“仿照/复刻/按图做/照着做”，且图片看起来像网页或应用截图，应优先判断为“截图复刻”任务：
   - 优先输出单页还原结论，除非图片明确展示了多页面结构
   - 不要擅自扩展成后台系统、管理平台、SaaS、仪表盘或多路由应用
   - 不要凭空补充图片中没有的业务模块、侧边栏、图表、数据表格或复杂流程
7. 如果图片明显是搜索首页、品牌官网首页、营销页或活动页，请在 summary 中直接指出，不要泛化成“通用业务系统”。
`;

function isScreenshotReplicaRequest(userText?: string): boolean {
  if (!userText) {
    return false;
  }

  return SCREENSHOT_REPLICA_KEYWORDS.some((keyword) => userText.includes(keyword));
}

function inferMimeTypeFromUrl(imageUrl: string): string {
  try {
    const pathname = imageUrl.startsWith("http") ? new URL(imageUrl).pathname : imageUrl;
    const ext = path.extname(pathname).toLowerCase();
    return EXTENSION_TO_MIME_TYPE[ext] || DEFAULT_IMAGE_MIME_TYPE;
  } catch {
    return DEFAULT_IMAGE_MIME_TYPE;
  }
}

function extractStorageKeyFromUrl(imageUrl: string): string | null {
  if (imageUrl.startsWith(LOCAL_UPLOAD_ROUTE_PREFIX)) {
    return decodeURIComponent(imageUrl.slice(LOCAL_UPLOAD_ROUTE_PREFIX.length));
  }

  if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://")) {
    return null;
  }

  try {
    const pathname = new URL(imageUrl).pathname;
    if (!pathname.startsWith(LOCAL_UPLOAD_ROUTE_PREFIX)) {
      return null;
    }
    return decodeURIComponent(pathname.slice(LOCAL_UPLOAD_ROUTE_PREFIX.length));
  } catch {
    return null;
  }
}

async function loadLocalImageAsBase64(imageUrl: string) {
  const storageKey = extractStorageKeyFromUrl(imageUrl);
  if (!storageKey) {
    return null;
  }

  if (storageKey.startsWith("/") || storageKey.includes("..") || storageKey.includes("\\")) {
    throw new Error(`Invalid local upload path: ${storageKey}`);
  }

  const uploadDir = resolveFromAppRoot(import.meta.url, "../../storage/uploads");
  const absolutePath = path.resolve(uploadDir, storageKey);
  if (absolutePath !== uploadDir && !absolutePath.startsWith(`${uploadDir}${path.sep}`)) {
    throw new Error(`Resolved upload path escaped storage root: ${storageKey}`);
  }

  const buffer = await fs.readFile(absolutePath);
  const mimeType = inferMimeTypeFromUrl(storageKey);
  const data = buffer.toString("base64");
  return `data:${mimeType};base64,${data}`;
}

async function toImageContentBlock(imageUrl: string): Promise<VisionContentBlock> {
  const localImage = await loadLocalImageAsBase64(imageUrl).catch((error) => {
    console.warn("[Vision] Failed to read local image, fallback to url:", error);
    return null;
  });

  if (localImage) {
    return {
      type: "image_url",
      image_url: {
        url: localImage,
      },
    };
  }

  return {
    type: "image_url",
    image_url: {
      url: imageUrl,
    },
  };
}

function extractResponseText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((block) => {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        (block as { type?: unknown }).type === "text" &&
        "text" in block &&
        typeof (block as { text?: unknown }).text === "string"
      ) {
        return (block as { text: string }).text;
      }

      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeVisionAnalysis(parsed: Record<string, unknown>): VisionAnalysisResult {
  return {
    summary: coerceString(parsed.summary, "图片展示了待实现的界面设计"),
    layout: coerceStringArray(parsed.layout),
    components: coerceStringArray(parsed.components),
    style: coerceStringArray(parsed.style),
    interactionHints: coerceStringArray(parsed.interactionHints),
  };
}

export function buildVisionAnalysisSummary(result: VisionAnalysisResult): string {
  const sections = [
    result.summary ? `整体概述：${result.summary}` : "",
    result.layout.length > 0 ? `布局结构：${result.layout.join("；")}` : "",
    result.components.length > 0 ? `关键组件：${result.components.join("；")}` : "",
    result.style.length > 0 ? `视觉风格：${result.style.join("；")}` : "",
    result.interactionHints.length > 0 ? `交互线索：${result.interactionHints.join("；")}` : "",
  ].filter(Boolean);

  return sections.join("\n");
}

export async function analyzeImages(
  input: VisionAnalysisInput,
): Promise<VisionAnalysisResult | null> {
  const imageUrls = input.imageUrls.filter(Boolean);
  if (imageUrls.length === 0) {
    return null;
  }

  const visionModel = getVisionModel();
  const provider = getVisionModelProvider();
  const modelName =
    (visionModel as { model?: string; modelName?: string }).model ||
    (visionModel as { model?: string; modelName?: string }).modelName ||
    "unknown";

  console.log(
    `[Vision] Start analyzing ${imageUrls.length} image(s) with provider: ${provider}, model: ${modelName}`,
  );

  const imageBlocks = await Promise.all(imageUrls.map(toImageContentBlock));
  const userText = input.userText?.trim();
  const replicaRequested = isScreenshotReplicaRequest(userText);
  console.log(
    "[Vision] Analysis context:",
    JSON.stringify(
      {
        replicaRequested,
        userText: userText || "",
        imageUrls,
      },
      null,
      2,
    ),
  );

  const prompt = [
    new SystemMessage(VISION_SYSTEM_PROMPT),
    new HumanMessage({
      content: [
        {
          type: "text",
          text: [
            `用户补充需求：${userText || "无"}`,
            replicaRequested
              ? "检测到用户可能希望按截图复刻页面。请优先判断为截图复刻任务，强调高保真、单页优先、不要扩展为后台系统或多页面产品。"
              : "请先判断这更像截图复刻还是风格参考，再结合图片输出可落地的前端分析。",
            "请结合这些图片，从布局、组件、风格、交互线索四个方面进行分析。",
            "再次强调：只返回 JSON 对象。",
          ].join("\n"),
        } satisfies VisionContentBlock,
        ...imageBlocks,
      ],
    }),
  ];

  try {
    const response = await withRetry(visionModel, prompt, {
      maxRetries: 2,
      onRetry: (attempt, error) => {
        console.warn(`[Vision] Retry attempt ${attempt} due to:`, error.message);
      },
      formatErrorFeedback: (error) =>
        `你上一次返回的内容无法被解析。错误：${error.message}\n请严格只返回 JSON 对象，字段必须包含 summary、layout、components、style、interactionHints。`,
    });

    const rawText = extractResponseText(response.content) || response.text;
    const parsed = parseLlmOutputObject({
      llmOutput: rawText,
      message: rawText,
    });

    if (!parsed) {
      throw new Error("Vision model returned non-JSON output");
    }

    const normalized = normalizeVisionAnalysis(parsed);

    if (replicaRequested) {
      if (!normalized.summary.includes("截图复刻")) {
        normalized.summary = [
          "任务判断：截图复刻。",
          "页面形态：优先单页还原。",
          "保真要求：高，尽量贴近截图中的布局、层级和组件，不要扩展为后台或多页系统。",
          normalized.summary,
        ].join(" ");
      }

      if (!normalized.layout.some((item) => item.includes("单页"))) {
        normalized.layout.unshift("优先按单页结构还原截图，不额外拆分多路由页面");
      }

      if (
        !normalized.interactionHints.some(
          (item) => item.includes("不要扩展") || item.includes("高保真"),
        )
      ) {
        normalized.interactionHints.unshift(
          "按截图高保真还原，除非图片明确展示，否则不要扩展额外页面、侧边栏或后台信息架构",
        );
      }
    }

    console.log("[Vision] Parsed analysis result:", JSON.stringify(normalized, null, 2));

    return normalized;
  } catch (error) {
    console.warn("[Vision] Image analysis failed, fallback to text-only flow.", error);
    return null;
  }
}

export async function analyzeImage(
  imageUrl: string,
  userText?: string,
): Promise<VisionAnalysisResult | null> {
  return analyzeImages({
    imageUrls: [imageUrl],
    userText,
  });
}
