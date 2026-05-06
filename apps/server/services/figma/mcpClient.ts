/**
 * Figma MCP Client
 * 通过本地 Figma Desktop 的 MCP Server 获取设计数据
 *
 * 连接方式：本地 HTTP（Figma Desktop 内置 MCP Server）
 * 默认端点：http://127.0.0.1:3845/mcp
 *
 * 核心功能：
 * - 获取设计数据（元数据、上下文、变量）
 * - 获取设计稿截图
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { FigmaDesignData, FigmaToolResult } from "./types.js";

// 默认 Figma Desktop MCP Server 端点
const DEFAULT_FIGMA_MCP_URL = "http://127.0.0.1:3845/mcp";

export class FigmaMCPClient {
  private client: Client | null = null;
  private transport: StreamableHTTPClientTransport | null = null;
  private connected: boolean = false;

  /**
   * 连接到本地 Figma Desktop MCP Server (HTTP 模式)
   */
  async connect(): Promise<void> {
    if (this.connected) {
      console.log("✅ Figma MCP Client already connected");
      return;
    }

    const url = process.env.FIGMA_MCP_URL || DEFAULT_FIGMA_MCP_URL;
    console.log("🔗 Connecting to Figma Desktop MCP Server...");
    console.log(`   URL: ${url}`);

    try {
      // 创建 HTTP transport（连接 Figma Desktop）
      this.transport = new StreamableHTTPClientTransport(new URL(url));

      // 创建 MCP 客户端
      this.client = new Client(
        {
          name: "coding-agent",
          version: "1.0.0",
        },
        {
          capabilities: {},
        },
      );

      // 连接客户端和 transport
      await this.client.connect(this.transport);
      this.connected = true;

      console.log("✅ Connected to Figma Desktop MCP Server");
      console.log("   Mode: Local HTTP");
      console.log(`   Endpoint: ${url}`);
    } catch (error) {
      console.error("❌ Failed to connect to Figma Desktop MCP Server:", error);
      console.error("   请确保：");
      console.error("   1. Figma Desktop 已安装并运行");
      console.error("   2. Figma Desktop 已登录并打开了设计文件");
      console.error("   3. MCP Server 正在监听 http://127.0.0.1:3845/mcp");
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      if (this.client) {
        await this.client.close();
      }
      if (this.transport) {
        await this.transport.close();
      }
      this.connected = false;
      this.client = null;
      this.transport = null;
      console.log("✅ Disconnected from Figma MCP Server");
    } catch (error) {
      console.error("❌ Error disconnecting from Figma:", error);
    }
  }

  /**
   * 确保已连接
   */
  private async ensureConnected(): Promise<void> {
    if (!this.connected) {
      await this.connect();
    }
  }

  /**
   * 调用 Figma MCP Server 工具
   */
  private async callTool(
    toolName: string,
    args: Record<string, any>,
    options?: { timeout?: number },
  ): Promise<FigmaToolResult> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error("MCP Client not initialized");
    }

    // 不同工具使用不同超时时间
    const timeout = options?.timeout ?? 60000; // 默认 60 秒

    try {
      console.log(`📞 Calling Figma tool: ${toolName}`, args);
      console.log(`   Timeout: ${timeout / 1000}s`);

      const result = await this.client.callTool(
        {
          name: toolName,
          arguments: args,
        },
        undefined, // resultSchema (不需要)
        {
          timeout,
          resetTimeoutOnProgress: true, // 如果有进度通知，重置超时
        },
      );

      console.log(`✅ Tool ${toolName} completed`);
      return result as FigmaToolResult;
    } catch (error) {
      console.error(`❌ Error calling tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * 获取 Figma MCP Server 生成的 UI 代码
   * 只调用 get_design_context，专为 figma-direct 流程设计
   * 不获取 metadata 和 variables，减少不必要的开销
   */
  async getGeneratedCode(figmaUrl: string): Promise<string> {
    await this.ensureConnected();

    try {
      console.log("🎨 [FigmaMCP] 获取 Figma 生成代码...");
      console.log(`   URL: ${figmaUrl}`);
      console.log("   ⏳ 代码生成可能需要 1-3 分钟，请耐心等待...");

      const result = await this.callTool(
        "get_design_context",
        { selection: figmaUrl },
        { timeout: 180000 }, // 3 分钟超时
      );

      const codeText = result.content[0]?.text || "";

      if (!codeText || codeText.trim().length === 0) {
        throw new Error("Figma MCP Server 返回空内容");
      }

      // 检查是否是 "Nothing is selected" 错误
      if (codeText.includes("Nothing is selected")) {
        throw new Error(
          "Figma Desktop 未选中任何内容。请确保：\n" +
            "1. 在 Figma Desktop 中打开了对应的设计文件\n" +
            "2. 选中了要导出的 Frame 或 Page",
        );
      }

      console.log(
        `✅ [FigmaMCP] 代码获取成功: ${codeText.length.toLocaleString()} 字符, ${codeText.split("\n").length} 行`,
      );

      return codeText;
    } catch (error) {
      console.error("❌ [FigmaMCP] 获取生成代码失败:", error);
      throw error;
    }
  }

  /**
   * 获取完整的设计数据（元数据 + 上下文 + 变量）
   */
  async getDesignData(figmaUrl: string): Promise<FigmaDesignData> {
    await this.ensureConnected();

    try {
      console.log("🎨 Fetching Figma design data via MCP...");

      // 1. 获取元数据（快速获取结构）
      const metadataResult = await this.callTool("get_metadata", {
        selection: figmaUrl,
      });
      const metadataText = metadataResult.content[0]?.text || "";

      // 调试：打印原始数据
      if (process.env.DEBUG_FIGMA === "true") {
        console.log("\n📋 Raw Metadata (first 500 chars):");
        console.log(metadataText.substring(0, 500));
      }

      // 检查是否返回错误信息
      if (metadataText.includes("Nothing is selected")) {
        throw new Error(
          "Figma Desktop 未选中任何内容。请确保：\n" +
            "1. 在 Figma Desktop 中打开了对应的设计文件\n" +
            "2. 选中了要导出的 Frame 或 Page\n" +
            "3. 或者使用文件的根 URL（不带 node-id 参数）",
        );
      }

      const metadata = metadataText;

      // 2. 获取设计上下文（详细设计信息）
      // 注意：这个操作可能需要较长时间，特别是对于复杂的设计文件
      console.log("⏳ 正在获取设计上下文（可能需要 1-3 分钟）...");
      const contextResult = await this.callTool(
        "get_design_context",
        {
          selection: figmaUrl,
        },
        {
          timeout: 180000, // 180 秒（3分钟）超时
        },
      );
      const contextText = contextResult.content[0]?.text || "{}";

      // 调试：打印原始数据
      if (process.env.DEBUG_FIGMA === "true") {
        console.log("\n📦 Raw Context (first 1000 chars):");
        console.log(contextText.substring(0, 1000));
        console.log("\n📊 Context type detection:");
        console.log("  - Starts with 'const':", contextText.trim().startsWith("const"));
        console.log("  - Starts with 'import':", contextText.trim().startsWith("import"));
        console.log("  - Contains 'export default':", contextText.includes("export default"));
      }

      // 检查返回的内容类型
      let context: any;

      // 如果返回的是代码（而不是JSON），说明 Figma MCP 直接生成了UI代码
      if (
        contextText.trim().startsWith("const ") ||
        contextText.trim().startsWith("import ") ||
        contextText.trim().startsWith("function ") ||
        contextText.includes("export default")
      ) {
        console.log("✨ Figma MCP 返回了生成的代码");
        // 将代码作为字符串存储
        context = {
          type: "generated_code",
          code: contextText,
          language: "typescript",
        };
      } else {
        // 尝试解析为 JSON
        try {
          context = JSON.parse(contextText);
        } catch {
          if (contextText.includes("Nothing is selected")) {
            throw new Error(
              "Figma Desktop 未选中任何内容。请在 Figma Desktop 中选中一个 Frame 或 Page",
            );
          }
          // 如果既不是代码也不是JSON，记录原始内容
          console.warn("⚠️  无法识别的设计上下文格式，使用原始文本");
          context = {
            type: "raw_text",
            text: contextText,
          };
        }
      }

      // 3. 获取变量定义（设计系统）
      let variables: any = {};
      try {
        const variablesResult = await this.callTool("get_variable_defs", {
          selection: figmaUrl,
        });
        const variablesText = variablesResult.content[0]?.text || "{}";
        variables = JSON.parse(variablesText);
      } catch (varError) {
        console.warn("⚠️  无法获取变量定义，继续使用空对象:", varError);
        // 变量是可选的，失败不影响主流程
      }

      console.log("✅ Figma design data fetched successfully");

      return {
        metadata,
        context,
        variables,
      };
    } catch (error) {
      console.error("❌ Error fetching Figma design data:", error);
      throw error;
    }
  }

  /**
   * 获取设计稿截图
   */
  async getScreenshot(
    figmaUrl: string,
    options?: { format?: "png" | "jpg"; scale?: number },
  ): Promise<string> {
    await this.ensureConnected();

    try {
      console.log("📸 Taking Figma screenshot via MCP...");

      const result = await this.callTool("get_screenshot", {
        selection: figmaUrl,
        format: options?.format || "png",
        scale: options?.scale || 2,
      });

      // 返回 base64 编码的图片数据
      const imageData = result.content[0]?.data || "";
      console.log("✅ Screenshot captured successfully");

      return imageData;
    } catch (error) {
      console.error("❌ Error taking screenshot:", error);
      throw error;
    }
  }

  /**
   * 创建设计系统规则
   */
  async createDesignSystemRules(figmaUrl: string): Promise<any> {
    await this.ensureConnected();

    try {
      console.log("📐 Creating design system rules...");

      const result = await this.callTool("create_design_system_rules", {
        selection: figmaUrl,
      });

      const rules = JSON.parse(result.content[0]?.text || "{}");
      console.log("✅ Design system rules created");

      return rules;
    } catch (error) {
      console.error("❌ Error creating design system rules:", error);
      throw error;
    }
  }

  /**
   * 列出可用的工具
   */
  async listTools(): Promise<any[]> {
    await this.ensureConnected();

    if (!this.client) {
      throw new Error("MCP Client not initialized");
    }

    try {
      const result = await this.client.listTools();
      return result.tools;
    } catch (error) {
      console.error("❌ Error listing tools:", error);
      throw error;
    }
  }
}

// 创建单例实例
let clientInstance: FigmaMCPClient | null = null;

/**
 * 获取 Figma MCP Client 单例
 */
export function getFigmaMCPClient(): FigmaMCPClient {
  if (!clientInstance) {
    clientInstance = new FigmaMCPClient();
  }
  return clientInstance;
}

/**
 * 关闭 Figma MCP Client
 */
export async function closeFigmaMCPClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.disconnect();
    clientInstance = null;
  }
}
