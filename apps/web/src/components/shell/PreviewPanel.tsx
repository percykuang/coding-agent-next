// 右侧预览面板
"use client";

import { PreviewToolbar } from "@/components/preview/PreviewToolbar";
import type { PreviewPanelProps } from "@/types/components";

/**
 * PreviewPanel
 *
 * 职责：
 * - 作为 Preview 区域的结构容器
 * - 承载 PreviewToolbar
 * - 将真正的预览内容（Sandpack）包裹进来
 *
 * 不负责：
 * - 不生成内容
 * - 不管理 Sandpack 状态
 * - 不直接控制布局（只能通过回调请求）
 */
export function PreviewPanel({
  children,
  layoutMode,
  onEnterFullScreen,
  onExitFullScreen,
}: PreviewPanelProps) {
  const isFullScreen = layoutMode === "preview-only";

  return (
    <section className="h-full w-full bg-gray-50">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="shrink-0 border-b border-gray-200 bg-white/95 px-3 py-1 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <PreviewToolbar
            isFullScreen={isFullScreen}
            onEnterFullScreen={onEnterFullScreen}
            onExitFullScreen={onExitFullScreen}
          />
        </div>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </section>
  );
}
