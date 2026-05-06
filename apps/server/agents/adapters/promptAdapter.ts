/**
 * Prompt 路由适配器
 */

import type { RouteInputAdapter } from "./routeTypes.js";
import { hasTextPrompt } from "./routeHelpers.js";

export const promptRouteAdapter: RouteInputAdapter = {
  name: "prompt-route",
  priority: 70,
  canHandle: ({ messages }) => hasTextPrompt(messages),
  adapt: async ({ messages, mockConfig, existingFiles }) => {
    console.log("[RouteAdapter] Matched: prompt-route");
    return {
      flow: "traditional",
      input: { messages, mockConfig, existingFiles },
      meta: { routeType: "prompt" },
    };
  },
};
