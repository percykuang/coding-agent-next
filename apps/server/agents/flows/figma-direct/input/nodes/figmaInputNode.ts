/**
 * Figma 直连流程 - 输入节点
 *
 * 职责：
 * 1. 接收 Figma URL
 * 2. 调用 Figma MCP Server 的 get_design_context 获取生成的 UI 代码
 * 3. 返回原始代码字符串，供后续节点解析和拆分
 *
 * 流程位置: Step 1 / 4
 * 上游: START (接收 figmaUrl)
 * 下游: codeParsingNode (解析代码结构)
 */

import { getFigmaMCPClient } from "../../../../../services/figma/mcpClient.js";

export const figmaInputNode = async (state: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("🔷 [FigmaInputNode] 开始获取 Figma 生成代码");
  console.log("=".repeat(80));

  const figmaUrl = state.figmaUrl;

  // ========== 1. 校验输入 ==========
  if (!figmaUrl) {
    console.error("❌ [FigmaInputNode] 错误: 缺少 figmaUrl");
    throw new Error("FigmaInputNode: 缺少 figmaUrl，请提供 Figma 设计稿链接");
  }

  console.log(`📎 [FigmaInputNode] Figma URL: ${figmaUrl}`);

  // ========== 2. 调用 MCP Server 获取生成代码 ==========
  let rawCode: string;

  try {
    console.log("⏳ [FigmaInputNode] 正在调用 Figma MCP Server...");
    console.log("   （首次连接可能需要几秒，代码生成可能需要 1-3 分钟）");

    const client = getFigmaMCPClient();
    rawCode = await client.getGeneratedCode(figmaUrl);
  } catch (error) {
    console.error("❌ [FigmaInputNode] Figma MCP Server 调用失败:", error);
    throw new Error(
      `Figma MCP Server 调用失败: ${error instanceof Error ? error.message : String(error)}\n` +
        "请确保：\n" +
        "1. Figma Desktop 已打开并登录\n" +
        "2. 设计文件已在 Figma Desktop 中打开\n" +
        "3. MCP Server 正在运行 (http://127.0.0.1:3845/mcp)",
    );
  }

  // ========== 3. 校验输出 ==========
  if (!rawCode || rawCode.trim().length === 0) {
    console.error("❌ [FigmaInputNode] MCP Server 返回空代码");
    throw new Error("Figma MCP Server 返回空代码，请检查设计稿是否有效");
  }

  // 检测 MCP 返回的是否是错误信息而非代码
  const MCP_ERROR_PATTERNS = [
    "The MCP server is only available if your active tab",
    "is only available if",
    "Error:",
    "error:",
    "Unable to",
    "Cannot find",
    "No node found",
  ];
  const isErrorMessage =
    rawCode.split("\n").length <= 3 &&
    MCP_ERROR_PATTERNS.some((pattern) => rawCode.includes(pattern));

  if (isErrorMessage) {
    console.error(`❌ [FigmaInputNode] MCP Server 返回错误信息: ${rawCode}`);
    throw new Error(
      `Figma MCP Server 返回错误而非代码:\n"${rawCode}"\n\n` +
        "请确保：\n" +
        "1. Figma Desktop 中该设计文件是当前激活的标签页\n" +
        "2. 不要切换到其他标签页或最小化 Figma Desktop\n" +
        "3. 设计文件已完全加载（不是空白页面）",
    );
  }

  // 进一步校验：真实代码至少应包含一些代码特征
  const MIN_CODE_LENGTH = 200;
  const hasCodeFeatures =
    rawCode.includes("import ") ||
    rawCode.includes("export ") ||
    rawCode.includes("function ") ||
    rawCode.includes("const ") ||
    rawCode.includes("return (") ||
    rawCode.includes("<div");

  if (rawCode.length < MIN_CODE_LENGTH || !hasCodeFeatures) {
    console.error(
      `❌ [FigmaInputNode] MCP 返回内容不像代码 (${rawCode.length} 字符): ${rawCode.substring(0, 200)}`,
    );
    throw new Error(
      `Figma MCP Server 返回的内容不是有效代码（仅 ${rawCode.length} 字符）。\n` +
        `内容预览: "${rawCode.substring(0, 100)}..."\n\n` +
        "请确保 Figma Desktop 中该设计文件为当前激活标签页后重试。",
    );
  }

  const codeLength = rawCode.length;
  const lineCount = rawCode.split("\n").length;

  // ========== 4. 检测代码语言 ==========
  let language = "typescript";
  if (rawCode.includes("import React") || rawCode.includes("jsx") || rawCode.includes("tsx")) {
    language = "tsx";
  }

  // ========== 5. 打印统计信息 ==========
  console.log("\n✅ [FigmaInputNode] 代码获取成功");
  console.log(`   📊 代码统计:`);
  console.log(`      - 字符数: ${codeLength.toLocaleString()}`);
  console.log(`      - 行数:   ${lineCount.toLocaleString()}`);
  console.log(`      - 语言:   ${language}`);
  console.log(`   📄 代码预览 (前 200 字符):`);
  console.log(`      ${rawCode.substring(0, 200).replace(/\n/g, "\n      ")}...`);
  console.log("");

  // ========== 6. 返回结果 ==========
  return {
    rawCode,
    codeLength,
    lineCount,
    language,
  };
};
