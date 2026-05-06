// 组件 Props 类型定义
import type { ReactNode } from "react";
import type { ThoughtItem, ProjectVersion } from "./store";

// ============================================================================
// 布局类型
// ============================================================================

/** 布局模式 */
export type LayoutMode = "split" | "preview-only";

// ============================================================================
// Shell 组件 Props
// ============================================================================

/** AppShell Props */
export interface AppShellProps {
  children: ReactNode;
}

/** PreviewPanel Props */
export interface PreviewPanelProps {
  children: ReactNode;
  layoutMode: LayoutMode;
  onEnterFullScreen: () => void;
  onExitFullScreen: () => void;
}

/** ThoughtChain Props */
export interface ThoughtChainProps {
  thoughts: ThoughtItem[];
}

/** VersionCard Props */
export interface VersionCardProps {
  version: ProjectVersion;
  projectName: string;
  onRollback?: () => void;
}

// ============================================================================
// Preview 组件 Props
// ============================================================================

/** PreviewToolbar Props */
export interface PreviewToolbarProps {
  isFullScreen: boolean;
  onEnterFullScreen: () => void;
  onExitFullScreen: () => void;
}
