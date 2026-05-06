/**
 * 图片请求路由适配器
 */

import type { RouteInputAdapter } from "./routeTypes.js";
import { hasImageAttachment } from "./routeHelpers.js";

export const imageRouteAdapter: RouteInputAdapter = {
  name: "image-route",
  priority: 80,
  canHandle: ({ messages }) => hasImageAttachment(messages),
  adapt: async ({ messages, mockConfig, existingFiles }) => {
    console.log("[RouteAdapter] Matched: image-route");
    return {
      flow: "traditional",
      input: { messages, mockConfig, existingFiles },
      meta: { routeType: "image" },
    };
  },
};
