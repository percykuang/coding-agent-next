import { T_Graph } from "../shared/schemas/graphSchema.js";
import { resolveFromAppRoot } from "../../utils/runtimePaths.js";

/**
 * 判断指定节点是否应该使用 Mock 数据
 * 优先级：State 中的动态配置 > 环境变量 MOCK_MODE
 *
 * @param state 当前 Graph 状态
 * @param nodeName 节点名称 (如 'uiNode', 'analysisNode')
 * @returns boolean
 */
export function shouldMock(state: T_Graph, nodeName: string): boolean {
  // 1. 优先读取 State 中的动态配置 (如果存在且显式设置了 boolean 值)
  if (state.mockConfig && typeof state.mockConfig[nodeName] === "boolean") {
    return state.mockConfig[nodeName];
  }

  // 2. Fallback: 使用环境变量 MOCK_MODE 作为默认值
  // 如果 MOCK_MODE=true，则默认开启 mock；否则关闭
  return process.env.MOCK_MODE === "true";
}

/**
 * 尝试执行 Mock 策略
 * @param state 当前 Graph 状态
 * @param nodeName 节点名称 (用于 shouldMock 判断和日志)
 * @param mockFileName Mock 文件名 (如 'analysisResult.json')
 * @param processResult 处理结果的回调或直接返回的 Key
 *        - 如果是字符串: 将结果包装在该 Key 下返回 (如 'analysis')
 *        - 如果是函数: (data: any, state: any) => any，允许自定义处理逻辑
 * @returns 如果执行了 Mock，返回结果对象；如果不应 Mock 或出错，返回 null。
 */
export async function tryExecuteMock(
  state: T_Graph,
  nodeName: string,
  mockFileName: string,
  processResult: string | ((data: any, state: any) => any),
) {
  // 1. 判断是否开启 Mock
  if (!shouldMock(state, nodeName)) {
    return null; // 不执行 Mock，交还控制权给真实逻辑
  }

  console.log(`--- ${nodeName} Head Start (MOCK) ---`);

  // 2. 模拟延迟
  await new Promise((resolve) => setTimeout(resolve, 100));

  try {
    // 3. 读取文件
    const fs = await import("fs/promises");
    const mockPath = resolveFromAppRoot(import.meta.url, "mock", mockFileName);
    const fileContent = await fs.readFile(mockPath, "utf-8");
    const jsonData = JSON.parse(fileContent);

    console.log(`--- ${nodeName} End (MOCK) ---`);

    // 4. 处理结果
    if (typeof processResult === "string") {
      // 简单模式：直接包装
      return { [processResult]: jsonData };
    } else if (typeof processResult === "function") {
      // 复杂模式：自定义回调
      return processResult(jsonData, state);
    }

    return jsonData; // 默认直接返回
  } catch (error) {
    console.error(`[MOCK] Failed to read mock data for ${nodeName}:`, error);
    // 返回 null 以便调用方决定是否回退到真实逻辑或返回空值
    return null;
  }
}
