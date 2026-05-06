/**
 * 主图（路由调度）
 *
 * 根据 mode 返回对应的生成图：
 * - "figma"       → Figma 直连图 (figma.graph.ts)
 * - "traditional" → Traditional 图 (traditional.graph.ts)
 *
 * 职责：
 * 1. 提供 buildAgent(mode) 工厂函数
 * 2. 复用 shared 工具导出 URL 检测能力（供历史调用兼容）
 */

import { buildTraditionalAgent } from "./traditional.graph.js";
import { buildFigmaAgent } from "./figma.graph.js";
import { extractFigmaUrl } from "../shared/utils/figmaUrl.js";

export { extractFigmaUrl };

// ==================== Agent 工厂 ====================

/**
 * 构建 Agent
 *
 * @param mode 指定模式
 *   - "traditional": Prompt 驱动的多步骤代码生成
 *   - "figma": Figma MCP 直连的代码拆分流程
 */
export function buildAgent(mode: "traditional" | "figma" = "traditional") {
  if (mode === "figma") {
    console.log("🎨 [MainGraph] 构建 Figma 直连图");
    return buildFigmaAgent();
  }

  console.log("📝 [MainGraph] 构建 Traditional 图");
  return buildTraditionalAgent();
}
