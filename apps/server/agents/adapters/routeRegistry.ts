/**
 * 聊天入口路由适配器注册表
 *
 * 职责仅保留：
 * 1. 管理路由级适配器顺序（优先级）
 * 2. 执行 first-match 分发
 */

import type { RouteAdapterContext, RouteAdapterResult, RouteInputAdapter } from "./routeTypes.js";
import { figmaRouteAdapter } from "./figmaAdapter.js";
import { modificationRouteAdapter } from "./modificationAdapter.js";
import { imageRouteAdapter } from "./imageAdapter.js";
import { promptRouteAdapter } from "./promptAdapter.js";

const fallbackRouteAdapter: RouteInputAdapter = {
  name: "traditional-route",
  priority: 10,
  canHandle: () => true,
  adapt: async ({ messages, mockConfig, existingFiles }) => ({
    flow: "traditional",
    input: { messages, mockConfig, existingFiles },
    meta: { routeType: "fallback" },
  }),
};

const ROUTE_ADAPTERS: RouteInputAdapter[] = [
  figmaRouteAdapter,
  modificationRouteAdapter,
  imageRouteAdapter,
  promptRouteAdapter,
  fallbackRouteAdapter,
].sort((a, b) => b.priority - a.priority);

export async function resolveRouteAdapter(
  context: RouteAdapterContext,
): Promise<RouteAdapterResult> {
  for (const adapter of ROUTE_ADAPTERS) {
    if (adapter.canHandle(context)) {
      console.log(
        `[RouteRegistry] Selected adapter: ${adapter.name} (priority=${adapter.priority})`,
      );
      return await adapter.adapt(context);
    }
  }

  console.log("[RouteRegistry] Selected adapter: traditional-route (fallback)");
  return await fallbackRouteAdapter.adapt(context);
}
