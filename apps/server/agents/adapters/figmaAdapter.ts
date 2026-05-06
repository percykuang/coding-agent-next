/**
 * Figma 请求路由适配器
 */

import type { RouteInputAdapter } from "./routeTypes.js";
import { extractFigmaUrl } from "../shared/utils/figmaUrl.js";

function resolveFigmaRouteEnabled() {
  const configured = process.env.ENABLE_FIGMA_ROUTE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;

  return process.env.NODE_ENV !== "production";
}

export const figmaRouteAdapter: RouteInputAdapter = {
  name: "figma-route",
  priority: 100,
  canHandle: ({ messages }) => !!extractFigmaUrl(messages),
  adapt: async ({ messages }) => {
    const figmaUrl = extractFigmaUrl(messages)!;
    if (!resolveFigmaRouteEnabled()) {
      console.log(`[RouteAdapter] Matched: figma-route but disabled, url=${figmaUrl}`);
      return {
        flow: "traditional",
        input: { messages },
        meta: {
          routeType: "figma-disabled",
          figmaUrl,
          reason: "当前线上 Beta 暂不支持 Figma 直连转码，请使用截图或文字描述继续生成。",
        },
      };
    }

    console.log(`[RouteAdapter] Matched: figma-route, url=${figmaUrl}`);
    return {
      flow: "figma",
      input: { messages, figmaUrl },
      meta: { routeType: "figma", figmaUrl },
    };
  },
};
