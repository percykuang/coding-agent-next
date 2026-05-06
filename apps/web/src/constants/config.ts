const apiBasePath = process.env.NEXT_PUBLIC_API_BASE_PATH || "/api";
const figmaRouteEnabled = process.env.NEXT_PUBLIC_ENABLE_FIGMA_ROUTE;

export const API_BASE_URL = apiBasePath.startsWith("/") ? apiBasePath : `/${apiBasePath}`;

export const IMG_UPLOAD_URL = `${API_BASE_URL}/upload/image`;
export const IMG_ACCESS_URL_PREFIX = "";
export const ENABLE_FIGMA_ROUTE =
  typeof figmaRouteEnabled === "string"
    ? figmaRouteEnabled.trim().toLowerCase() === "true"
    : process.env.NODE_ENV !== "production";
