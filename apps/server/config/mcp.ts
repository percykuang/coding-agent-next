/**
 * MCP Server 配置
 * 配置 Figma 等 MCP Server 的连接信息
 */

export interface MCPConfig {
  figma?: {
    serverUrl: string;
    apiKey?: string;
  };
  // 未来可扩展其他 MCP Server
}

export const mcpConfig: MCPConfig = {
  figma: {
    serverUrl: process.env.FIGMA_MCP_SERVER_URL || "",
    apiKey: process.env.FIGMA_API_KEY || "",
  },
};
