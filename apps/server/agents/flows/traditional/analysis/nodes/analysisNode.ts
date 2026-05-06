import { AIMessage, BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { AnalysisSchema } from "../schemas/analysisSchema.js";
import { ANALYSIS_SYSTEM_PROMPT } from "../prompts/analysisPrompts.js";
import { getStructuredModel } from "../../../../utils/model.js";
import { tryExecuteMock } from "../../../../utils/mock.js";
import { withRetry } from "../../../../utils/retry.js";
import {
  analyzeImages,
  buildVisionAnalysisSummary,
} from "../../../../../services/vision/analyzer.js";

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

const SVG_ILLUSTRATION_KEYWORDS = [
  "svg绘制",
  "svg 绘制",
  "svg画",
  "svg 画",
  "用svg",
  "用 svg",
  "矢量",
  "描摹",
  "轮廓",
  "头像",
  "logo",
  "图形化",
];

function extractLastUserMessage(rawMessages: any[]) {
  const userMessages = rawMessages.filter((message) => message?.role === "user");
  return userMessages[userMessages.length - 1] ?? null;
}

function getImageUrls(message: any): string[] {
  if (!Array.isArray(message?.attachments)) {
    return [];
  }

  return message.attachments
    .filter((attachment: any) => attachment?.type === "image" && attachment.url)
    .map((attachment: any) => String(attachment.url));
}

function buildExistingFilesContext(existingFiles?: Record<string, string>) {
  if (!existingFiles || Object.keys(existingFiles).length === 0) {
    return null;
  }

  const filePaths = Object.keys(existingFiles).sort((left, right) => left.localeCompare(right));

  const importantFiles = filePaths
    .filter(
      (filePath) =>
        filePath === "/App.tsx" ||
        filePath.startsWith("/pages/") ||
        filePath.startsWith("/components/") ||
        filePath.startsWith("/hooks/") ||
        filePath.startsWith("/services/"),
    )
    .slice(0, 20);

  const listedFiles = importantFiles.length > 0 ? importantFiles : filePaths.slice(0, 20);

  return [
    `当前项目已有 ${filePaths.length} 个文件。`,
    "请将本次需求理解为在现有项目基础上的改写，而不是完全忽略既有结构重做。",
    "现有关键文件：",
    ...listedFiles.map((filePath) => `- ${filePath}`),
  ].join("\n");
}

function isScreenshotReplicaRequest(textContent?: string) {
  if (!textContent) {
    return false;
  }

  return SCREENSHOT_REPLICA_KEYWORDS.some((keyword) => textContent.includes(keyword));
}

function isSvgIllustrationRequest(textContent?: string) {
  if (!textContent) {
    return false;
  }

  const normalized = textContent.toLowerCase();
  return SVG_ILLUSTRATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function buildAnalysisInput(
  textContent: string,
  visionSummary: string | null,
  replicaRequested: boolean,
  svgIllustrationRequested: boolean,
) {
  const normalizedText = textContent.trim() || "用户上传了图片，希望根据图片生成对应界面代码。";

  if (!visionSummary) {
    if (!replicaRequested) {
      return normalizedText;
    }

    return [
      `用户原始需求：${normalizedText}`,
      "",
      svgIllustrationRequested
        ? [
            "[SVG 绘制要求]",
            "用户更可能是在要求把图片转成单页网页中的内联 SVG 图形。",
            "优先理解为自定义 SVG 插画/轮廓描摹任务，不要扩展成图标库、图标检索器、头像管理系统或多页面产品。",
            "",
          ].join("\n")
        : "",
      "[截图复刻要求]",
      "用户更可能是在要求按图片复刻网页。",
      "优先理解为单页界面还原任务，不要擅自扩展为后台系统、多页面产品或额外业务流程。",
    ].join("\n");
  }

  return [
    `用户原始需求：${normalizedText}`,
    "",
    replicaRequested
      ? [
          "[截图复刻要求]",
          "用户更可能是在要求按图片复刻网页。",
          "请优先输出单页高保真还原理解，不要把搜索首页、品牌首页或普通网页截图误判为管理后台或 SaaS 系统。",
          "",
        ].join("\n")
      : "",
    svgIllustrationRequested
      ? [
          "[SVG 绘制要求]",
          "用户更可能是在要求把图片转成网页中的自定义内联 SVG 图形。",
          "请优先理解为单页 SVG 插画/轮廓描摹任务，不要生成图标库、图标 ID 查询器、远程图标加载器，也不要把头像误解为需要检索的系统图标。",
          "",
        ].join("\n")
      : "",
    "[图片视觉分析]",
    visionSummary,
    "",
    "请结合文字需求和图片分析结果，输出结构化的需求分析。",
  ].join("\n");
}

async function convertToLangChainMessages(
  rawMessages: Array<{
    role: string;
    content?: string;
    visionSummary?: string | null;
    replicaRequested?: boolean;
    svgIllustrationRequested?: boolean;
  }>,
): Promise<BaseMessage[]> {
  return rawMessages.map((msg) => {
    const textContent = typeof msg.content === "string" ? msg.content : "";

    if (msg.role === "user") {
      return new HumanMessage(
        buildAnalysisInput(
          textContent,
          msg.visionSummary ?? null,
          msg.replicaRequested ?? false,
          msg.svgIllustrationRequested ?? false,
        ),
      );
    }

    return new AIMessage(textContent || "助手已回复上一轮请求");
  });
}

export const analysisNode = async (state: any) => {
  const structuredModel = getStructuredModel(AnalysisSchema);

  let messages: BaseMessage[] = [];
  let visionSummary: string | null = null;
  const existingFilesContext = buildExistingFilesContext(state.existingFiles);

  if (state.messages && Array.isArray(state.messages)) {
    const lastUserMessage = extractLastUserMessage(state.messages);

    if (lastUserMessage) {
      const imageUrls = getImageUrls(lastUserMessage);
      const replicaRequested =
        imageUrls.length > 0 &&
        isScreenshotReplicaRequest(
          typeof lastUserMessage.content === "string" ? lastUserMessage.content : undefined,
        );
      const svgIllustrationRequested =
        imageUrls.length > 0 &&
        isSvgIllustrationRequest(
          typeof lastUserMessage.content === "string" ? lastUserMessage.content : undefined,
        );

      if (imageUrls.length > 0) {
        const visionResult = await analyzeImages({
          imageUrls,
          userText:
            typeof lastUserMessage.content === "string" ? lastUserMessage.content : undefined,
        });

        if (visionResult) {
          visionSummary = buildVisionAnalysisSummary(visionResult);
          console.log("[AnalysisNode] Attached vision analysis to prompt context.");
          console.log("[AnalysisNode] Vision summary:\n" + visionSummary);
        }
      }

      messages = await convertToLangChainMessages([
        {
          ...lastUserMessage,
          visionSummary,
          replicaRequested,
          svgIllustrationRequested,
        },
      ]);
    }
  }

  const systemPrompt = existingFilesContext
    ? `${ANALYSIS_SYSTEM_PROMPT}\n\n[现有项目上下文]\n${existingFilesContext}`
    : ANALYSIS_SYSTEM_PROMPT;

  const prompt = [new SystemMessage(systemPrompt), ...messages];

  console.log("\n📋 [AnalysisNode] 开始意图分析（输入来源已由路由层处理）");

  const mockResult = await tryExecuteMock(state, "analysisNode", "analysisResult.json", "analysis");
  if (mockResult) {
    return {
      ...mockResult,
      skipGeneration:
        mockResult.analysis?.type === "QA" || mockResult.analysis?.type === "CHIT_CHAT",
    };
  }

  console.log("--- User Message Analysis Start ---");

  const result = await withRetry(structuredModel, prompt, {
    maxRetries: 3,
    onRetry: (attempt, error) => {
      console.warn(`[AnalysisNode] Retry attempt ${attempt} due to:`, error.message);
    },
  });

  if (visionSummary) {
    result.designAnalysis = visionSummary;
  }

  console.log("--- User Message Analysis End ---");
  console.log("📊 [AnalysisNode] 用户意图:", result.type);

  return {
    analysis: result,
    skipGeneration: result.type === "QA" || result.type === "CHIT_CHAT",
  };
};
