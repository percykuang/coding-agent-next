// 应用主壳层组件
"use client";

import { useState } from "react";
import Image from "next/image";
import { ChatPanel } from "./ChatPanel";
import { PreviewPanel } from "./PreviewPanel";
import type { LayoutMode, AppShellProps } from "@/types/components";

/**
 * AppShell
 *
 * 职责：
 * - 管理整体布局结构（两列 / 预览全屏）
 * - 分配 Chat / Preview 的空间
 *
 * 不负责：
 * - 不处理任何业务逻辑
 * - 不关心 prompt / sandpack / AI
 * - 不直接依赖 store（未来可由上层注入）
 */

export function AppShell({ children }: AppShellProps) {
  /**
   * 当前布局模式
   *
   * split         : Chat + Preview
   * preview-only  : Preview 全屏
   */
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("split");

  /**
   * 布局控制方法
   * 注意：这里只是能力，不是业务触发
   */
  const showPreviewOnly = () => setLayoutMode("preview-only");
  const showSplit = () => setLayoutMode("split");

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50">
      {/* 顶部 Header */}
      <header className="flex h-14 shrink-0 items-center border-b border-gray-200 bg-white px-4">
        <div className="flex items-center gap-3">
          {/* Logo 和标题 */}
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-transparent">
              <Image
                src="/logo.svg"
                alt="Percy logo"
                width={24}
                height={24}
                priority
                unoptimized
                className="h-6 w-6 object-contain"
                sizes="32px"
              />
            </div>
            <span>Coding Agent</span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">
              Beta
            </span>
          </div>
        </div>
      </header>

      {/* 下方主体内容：包含 Chat 和 Preview */}
      <main
        className={`flex flex-1 overflow-hidden p-4 transition-[gap] duration-300 ease-out ${
          layoutMode === "preview-only" ? "gap-0" : "gap-4"
        }`}
      >
        {/* 左侧 Chat 面板 */}
        <div
          className={`flex shrink-0 flex-col transition-all duration-300 ease-out ${
            layoutMode === "preview-only"
              ? "pointer-events-none w-0 opacity-0"
              : "w-100 opacity-100"
          }`}
        >
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <ChatPanel />
          </div>
        </div>

        {/* 右侧 Preview 面板 */}
        <div className="relative flex-1 bg-gray-50 transition-all duration-300 ease-out">
          <PreviewPanel
            layoutMode={layoutMode}
            onExitFullScreen={showSplit}
            onEnterFullScreen={showPreviewOnly}
          >
            {children}
          </PreviewPanel>
        </div>
      </main>
    </div>
  );
}
