import "dotenv/config";
import { ChatOpenAI } from "@langchain/openai";
import { ZodType } from "zod";

/**
 * 多模型架构：
 * - DeepSeek: 主模型选项1（用于大部分节点，支持 Function Calling）
 * - GLM: 主模型选项2（智谱 AI，支持 Function Calling）
 * - MiMo: 小米 OpenAI-compatible 模型（用于通用推理 / 代码生成）
 * - Ollama: 本地 OpenAI-compatible 模型（用于本地推理 / 调试）
 * - Qwen-VL: Vision 模型（仅用于图片分析）
 *
 * 通过环境变量 MAIN_MODEL_PROVIDER 切换主模型：
 * deepseek | glm | mimo | ollama
 */

let deepseekInstance: ChatOpenAI | null = null;
let glmInstance: ChatOpenAI | null = null;
let mimoInstance: ChatOpenAI | null = null;
let mimoReasonerInstance: ChatOpenAI | null = null;
let ollamaInstance: ChatOpenAI | null = null;
let ollamaReasonerInstance: ChatOpenAI | null = null;
let qwenVisionInstance: ChatOpenAI | null = null;
let deepseekVisionInstance: ChatOpenAI | null = null;
let glmVisionInstance: ChatOpenAI | null = null;
let mimoVisionInstance: ChatOpenAI | null = null;
let ollamaVisionInstance: ChatOpenAI | null = null;

const DEFAULT_MIMO_BASE_URL = "https://api.xiaomimimo.com";
// 默认模型 ID 参考公开 OpenAI-compatible provider 的命名，可通过 MIMO_MODEL 覆盖。
const DEFAULT_MIMO_MODEL = "mimo-v2.5-pro";
const DEFAULT_MIMO_VISION_MODEL = "mimo-v2-omni";
const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_API_KEY = "ollama";

function resolveMiMoVisionModel(): string {
  const configured = process.env.MIMO_VISION_MODEL?.trim();
  if (!configured) {
    return DEFAULT_MIMO_VISION_MODEL;
  }

  const normalized = configured.toLowerCase();
  if (
    normalized === "mimo-v2.5" ||
    normalized === "mimo-v2.5-pro" ||
    normalized === "mimo-v2-pro"
  ) {
    console.warn(
      `[Model] MIMO_VISION_MODEL=${configured} 更偏文本/推理，自动切换为 ${DEFAULT_MIMO_VISION_MODEL} 以支持图片理解。`,
    );
    return DEFAULT_MIMO_VISION_MODEL;
  }

  return configured;
}

function getNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeOpenAICompatibleBaseURL(baseURL: string): string {
  const normalized = baseURL.replace(/\/+$/, "");
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function resolveMainModelProvider(): string {
  return process.env.MAIN_MODEL_PROVIDER || "deepseek";
}

function normalizeVisionProvider(provider: string): string {
  const normalized = provider.trim().toLowerCase();

  if (
    normalized === "mimo" ||
    normalized === "xiaomi" ||
    normalized === "xiaomimimo" ||
    normalized.startsWith("mimo-")
  ) {
    return "mimo";
  }

  if (normalized === "qwen" || normalized.startsWith("qwen-")) {
    return "qwen";
  }

  if (normalized === "glm" || normalized.startsWith("glm-")) {
    return "glm";
  }

  if (normalized === "ollama" || normalized.startsWith("llama")) {
    return "ollama";
  }

  if (normalized === "deepseek" || normalized.startsWith("deepseek-")) {
    return "deepseek";
  }

  return normalized;
}

function resolveVisionModelProvider(): string {
  if (process.env.VISION_MODEL_PROVIDER) {
    return normalizeVisionProvider(process.env.VISION_MODEL_PROVIDER);
  }

  if (process.env.MIMO_VISION_MODEL) {
    return "mimo";
  }

  if (process.env.QWEN_API_KEY) {
    return "qwen";
  }

  return resolveMainModelProvider();
}

/**
 * 获取 DeepSeek 主模型实例（用于大部分节点）
 * 支持 Function Calling，结构化输出能力强
 */
export function getDeepSeekModel() {
  if (!deepseekInstance) {
    deepseekInstance = new ChatOpenAI({
      model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY,
      temperature: 0,
      maxTokens: 8192, // DeepSeek 最大支持 8K tokens
      configuration: {
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      },
    });
  }
  return deepseekInstance;
}

/**
 * 获取 GLM 主模型实例（智谱 AI）
 * 支持 Function Calling，结构化输出能力强
 */
export function getGLMModel() {
  if (!glmInstance) {
    glmInstance = new ChatOpenAI({
      model: process.env.GLM_MODEL || "glm-4-flash",
      apiKey: process.env.GLM_API_KEY,
      temperature: 0,
      maxTokens: 8192,
      configuration: {
        baseURL: process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4/",
      },
    });
  }
  return glmInstance;
}

/**
 * 获取 MiMo 主模型实例
 * 通过 OpenAI-compatible 接口连接小米 MiMo Open Platform
 */
export function getMiMoModel() {
  if (!mimoInstance) {
    mimoInstance = new ChatOpenAI({
      model: process.env.MIMO_MODEL || DEFAULT_MIMO_MODEL,
      apiKey: process.env.MIMO_API_KEY,
      temperature: getNumberEnv("MIMO_TEMPERATURE", 0),
      maxTokens: getNumberEnv("MIMO_MAX_TOKENS", 8192),
      configuration: {
        baseURL: normalizeOpenAICompatibleBaseURL(
          process.env.MIMO_BASE_URL || DEFAULT_MIMO_BASE_URL,
        ),
      },
    });
  }
  return mimoInstance;
}

/**
 * 获取 MiMo Reasoner 模型实例
 * 允许主模型和推理模型分离配置
 */
export function getMiMoReasonerModel() {
  if (!mimoReasonerInstance) {
    mimoReasonerInstance = new ChatOpenAI({
      model: process.env.MIMO_REASONER_MODEL || process.env.MIMO_MODEL || DEFAULT_MIMO_MODEL,
      apiKey: process.env.MIMO_API_KEY,
      temperature: getNumberEnv("MIMO_REASONER_TEMPERATURE", 0),
      maxTokens: getNumberEnv("MIMO_REASONER_MAX_TOKENS", getNumberEnv("MIMO_MAX_TOKENS", 8192)),
      configuration: {
        baseURL: normalizeOpenAICompatibleBaseURL(
          process.env.MIMO_BASE_URL || DEFAULT_MIMO_BASE_URL,
        ),
      },
    });
  }
  return mimoReasonerInstance;
}

/**
 * 获取 Ollama 主模型实例
 * 通过 OpenAI-compatible 接口连接本地 Ollama
 */
export function getOllamaModel() {
  if (!ollamaInstance) {
    ollamaInstance = new ChatOpenAI({
      model: process.env.OLLAMA_MODEL || "llama3.1",
      apiKey: process.env.OLLAMA_API_KEY || DEFAULT_OLLAMA_API_KEY,
      temperature: getNumberEnv("OLLAMA_TEMPERATURE", 0),
      maxTokens: getNumberEnv("OLLAMA_MAX_TOKENS", 8192),
      configuration: {
        baseURL: normalizeOpenAICompatibleBaseURL(
          process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
        ),
      },
    });
  }
  return ollamaInstance;
}

/**
 * 获取 Ollama Reasoner 模型实例
 * 用于需要更强推理能力的场景，可与主模型分离配置
 */
export function getOllamaReasonerModel() {
  if (!ollamaReasonerInstance) {
    ollamaReasonerInstance = new ChatOpenAI({
      model: process.env.OLLAMA_REASONER_MODEL || process.env.OLLAMA_MODEL || "llama3.1",
      apiKey: process.env.OLLAMA_API_KEY || DEFAULT_OLLAMA_API_KEY,
      temperature: getNumberEnv("OLLAMA_REASONER_TEMPERATURE", 0),
      maxTokens: getNumberEnv(
        "OLLAMA_REASONER_MAX_TOKENS",
        getNumberEnv("OLLAMA_MAX_TOKENS", 8192),
      ),
      configuration: {
        baseURL: normalizeOpenAICompatibleBaseURL(
          process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
        ),
      },
    });
  }
  return ollamaReasonerInstance;
}

/**
 * 获取 Qwen-VL Vision 模型实例（仅用于图片分析）
 * 支持图片输入和分析
 */
export function getQwenVisionModel() {
  if (!qwenVisionInstance) {
    qwenVisionInstance = new ChatOpenAI({
      model: process.env.QWEN_MODEL || "qwen-vl-max",
      apiKey: process.env.QWEN_API_KEY,
      temperature: 0.1,
      maxTokens: 32768, // Qwen-VL-Max 支持 32K tokens
      configuration: {
        baseURL: process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
    });
  }
  return qwenVisionInstance;
}

export function getDeepSeekVisionModel() {
  if (!deepseekVisionInstance) {
    deepseekVisionInstance = new ChatOpenAI({
      model: process.env.DEEPSEEK_VISION_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat",
      apiKey: process.env.DEEPSEEK_API_KEY,
      temperature: 0.1,
      maxTokens: 8192,
      configuration: {
        baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      },
    });
  }
  return deepseekVisionInstance;
}

export function getGLMVisionModel() {
  if (!glmVisionInstance) {
    glmVisionInstance = new ChatOpenAI({
      model: process.env.GLM_VISION_MODEL || process.env.GLM_MODEL || "glm-4-flash",
      apiKey: process.env.GLM_API_KEY,
      temperature: 0.1,
      maxTokens: 8192,
      configuration: {
        baseURL: process.env.GLM_BASE_URL || "https://open.bigmodel.cn/api/paas/v4/",
      },
    });
  }
  return glmVisionInstance;
}

export function getMiMoVisionModel() {
  if (!mimoVisionInstance) {
    mimoVisionInstance = new ChatOpenAI({
      model: resolveMiMoVisionModel(),
      apiKey: process.env.MIMO_API_KEY,
      temperature: getNumberEnv("MIMO_VISION_TEMPERATURE", 0.1),
      maxTokens: getNumberEnv("MIMO_VISION_MAX_TOKENS", getNumberEnv("MIMO_MAX_TOKENS", 8192)),
      configuration: {
        baseURL: normalizeOpenAICompatibleBaseURL(
          process.env.MIMO_BASE_URL || DEFAULT_MIMO_BASE_URL,
        ),
      },
    });
  }
  return mimoVisionInstance;
}

export function getOllamaVisionModel() {
  if (!ollamaVisionInstance) {
    ollamaVisionInstance = new ChatOpenAI({
      model: process.env.OLLAMA_VISION_MODEL || process.env.OLLAMA_MODEL || "llama3.2-vision",
      apiKey: process.env.OLLAMA_API_KEY || DEFAULT_OLLAMA_API_KEY,
      temperature: getNumberEnv("OLLAMA_VISION_TEMPERATURE", 0.1),
      maxTokens: getNumberEnv("OLLAMA_VISION_MAX_TOKENS", getNumberEnv("OLLAMA_MAX_TOKENS", 8192)),
      configuration: {
        baseURL: normalizeOpenAICompatibleBaseURL(
          process.env.OLLAMA_BASE_URL || DEFAULT_OLLAMA_BASE_URL,
        ),
      },
    });
  }
  return ollamaVisionInstance;
}

/**
 * 获取当前配置的主模型
 * 根据环境变量 MAIN_MODEL_PROVIDER 切换：
 * deepseek | glm | mimo | ollama
 */
export function getMainModel() {
  const provider = resolveMainModelProvider();

  switch (provider.toLowerCase()) {
    case "mimo":
    case "xiaomi":
    case "xiaomimimo":
      console.log("[Model] Using Xiaomi MiMo as main model");
      return getMiMoModel();
    case "ollama":
      console.log("[Model] Using Ollama as main model");
      return getOllamaModel();
    case "glm":
      console.log("[Model] Using GLM as main model");
      return getGLMModel();
    case "deepseek":
    default:
      console.log("[Model] Using DeepSeek as main model");
      return getDeepSeekModel();
  }
}

/**
 * 获取默认模型（向后兼容）
 * 使用当前配置的主模型
 */
export function getModel() {
  return getMainModel();
}

/**
 * 获取推理模型
 * - Ollama: 优先使用单独配置的 OLLAMA_REASONER_MODEL
 * - 其他提供商: 默认复用当前主模型
 */
export function getReasonerModel() {
  const provider = resolveMainModelProvider();

  switch (provider.toLowerCase()) {
    case "mimo":
    case "xiaomi":
    case "xiaomimimo":
      console.log("[Model] Using Xiaomi MiMo reasoner model");
      return getMiMoReasonerModel();
    case "ollama":
      console.log("[Model] Using Ollama reasoner model");
      return getOllamaReasonerModel();
    default:
      return getMainModel();
  }
}

/**
 * 获取视觉模型
 * 优先读取 VISION_MODEL_PROVIDER；若未配置且存在 QWEN_API_KEY，则默认使用 Qwen-VL；
 * 否则回退到当前主模型提供商对应的实例。
 */
export function getVisionModel() {
  const provider = resolveVisionModelProvider();

  switch (provider.toLowerCase()) {
    case "qwen":
    case "qwen-vl":
      console.log("[Model] Using Qwen vision model");
      return getQwenVisionModel();
    case "mimo":
    case "xiaomi":
    case "xiaomimimo":
      console.log(`[Model] Using Xiaomi MiMo vision model (${resolveMiMoVisionModel()})`);
      return getMiMoVisionModel();
    case "ollama":
      console.log(
        `[Model] Using Ollama vision model (${process.env.OLLAMA_VISION_MODEL || process.env.OLLAMA_MODEL || "llama3.2-vision"})`,
      );
      return getOllamaVisionModel();
    case "glm":
      console.log(
        `[Model] Using GLM vision model (${process.env.GLM_VISION_MODEL || process.env.GLM_MODEL || "glm-4-flash"})`,
      );
      return getGLMVisionModel();
    case "deepseek":
    default:
      console.log(
        `[Model] Using DeepSeek vision model (${process.env.DEEPSEEK_VISION_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat"})`,
      );
      return getDeepSeekVisionModel();
  }
}

/**
 * 获取支持结构化输出的模型实例
 * 使用当前配置的主模型，支持 Function Calling
 */
export function getStructuredModel<T extends ZodType<any>>(schema: T) {
  const model = getMainModel();
  return model.withStructuredOutput(schema, {
    method: "functionCalling",
    includeRaw: false,
  });
}

/**
 * 获取当前主模型提供商名称
 */
export function getMainModelProvider(): string {
  return resolveMainModelProvider();
}

export function getVisionModelProvider(): string {
  return resolveVisionModelProvider();
}
