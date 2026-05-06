// 全局类型扩展
import type { SandpackFiles } from "./store";

declare global {
  interface Window {
    /** Sandpack 模板文件（由 SandpackView 设置，供 PreviewToolbar 使用） */
    __templateFiles?: SandpackFiles;
  }
}

export {};
