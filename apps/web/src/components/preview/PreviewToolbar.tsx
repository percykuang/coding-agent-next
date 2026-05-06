// 预览工具栏组件
"use client";

import { useState } from "react";
import { Code2, Download, Eye, Maximize2, Minimize2 } from "lucide-react";
import { useSandpackStore } from "@/store/sandpackStore";
import { downloadGeneratedCode } from "@/lib/downloadCode";
import { toast } from "sonner";
import type { PreviewToolbarProps } from "@/types/components";

/**
 * PreviewToolbar
 *
 * 职责：
 * - 提供 Preview 区域的视图切换（预览 / 代码）
 * - 提供 Preview 区域的布局控制（全屏 / 退出全屏）
 * - 提供代码下载功能
 *
 * 不负责：
 * - 不管理状态
 * - 不知道 Sandpack / Chat
 */
export function PreviewToolbar({
  isFullScreen,
  onEnterFullScreen,
  onExitFullScreen,
}: PreviewToolbarProps) {
  const generatedFiles = useSandpackStore((state) => state.generatedFiles);
  const workspaceFiles = useSandpackStore((state) => state.workspaceFiles);
  const viewMode = useSandpackStore((state) => state.viewMode);
  const setViewMode = useSandpackStore((state) => state.setViewMode);
  const [isDownloading, setIsDownloading] = useState(false);

  // 从全局获取 templateFiles（由 SandpackView 设置）
  const templateFiles = typeof window !== "undefined" ? window.__templateFiles || {} : {};
  const hasDownloadableFiles =
    workspaceFiles || generatedFiles || Object.keys(templateFiles).length > 0;

  const handleDownload = async () => {
    if (!hasDownloadableFiles) {
      toast.error("暂无可下载的代码");
      return;
    }

    setIsDownloading(true);
    try {
      // 优先下载当前工作区，确保用户手动修改后的代码也被保留
      const filesToDownload = workspaceFiles || generatedFiles || templateFiles;
      await downloadGeneratedCode(filesToDownload, templateFiles);
      toast.success("代码下载成功");
    } catch (error) {
      console.error("下载失败:", error);
      toast.error("下载失败，请重试");
    } finally {
      setIsDownloading(false);
    }
  };

  const isDownloadDisabled = !hasDownloadableFiles || isDownloading;
  const viewToggleButtonClassName =
    "flex h-7 cursor-pointer items-center gap-1 rounded-sm px-2 py-0.5 text-xs font-medium transition-all";
  const secondaryActionButtonClassName =
    "flex h-7 cursor-pointer items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-0.5 text-[11px] font-medium text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-gray-200 disabled:hover:bg-white";

  return (
    <div className="flex flex-wrap items-center justify-between gap-1.5">
      <div className="inline-flex items-center gap-0.5 rounded-md border border-gray-200 bg-gray-100 p-0.5">
        <button
          type="button"
          onClick={() => setViewMode("preview")}
          aria-pressed={viewMode === "preview"}
          className={`${viewToggleButtonClassName} ${
            viewMode === "preview"
              ? "bg-black text-white shadow-sm hover:bg-gray-900"
              : "text-gray-500 hover:bg-white hover:text-gray-900"
          }`}
        >
          <Eye className="h-3 w-3" />
          预览
        </button>
        <button
          type="button"
          onClick={() => setViewMode("code")}
          aria-pressed={viewMode === "code"}
          className={`${viewToggleButtonClassName} ${
            viewMode === "code"
              ? "bg-black text-white shadow-sm hover:bg-gray-900"
              : "text-gray-500 hover:bg-white hover:text-gray-900"
          }`}
        >
          <Code2 className="h-3 w-3" />
          代码
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {viewMode === "code" && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={isDownloadDisabled}
            className={secondaryActionButtonClassName}
            title={!hasDownloadableFiles ? "正在加载模板..." : "下载代码"}
          >
            <Download className="h-3 w-3" />
            {isDownloading ? "下载中..." : "下载代码"}
          </button>
        )}

        <button
          type="button"
          onClick={isFullScreen ? onExitFullScreen : onEnterFullScreen}
          className={secondaryActionButtonClassName}
        >
          {isFullScreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          {isFullScreen ? "退出全屏" : "全屏"}
        </button>
      </div>
    </div>
  );
}
