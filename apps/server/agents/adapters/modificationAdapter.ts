/**
 * 修改请求路由适配器
 */

import type { RouteInputAdapter } from "./routeTypes.js";
import { isModificationRequest } from "./routeHelpers.js";

export const modificationRouteAdapter: RouteInputAdapter = {
  name: "modification-route",
  priority: 90,
  canHandle: ({ messages }) => isModificationRequest(messages),
  adapt: async ({ messages, mockConfig, existingFiles }) => {
    console.log("[RouteAdapter] Matched: modification-route");
    return {
      flow: "traditional",
      input: { messages, mockConfig, existingFiles },
      meta: { routeType: "modification" },
    };
  },
};
