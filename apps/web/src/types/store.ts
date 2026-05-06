// Store 相关类型定义
import type { ReactNode } from "react";
import type { ChatMessage } from "./message";
import type { FlowType } from "./flow";

// ============================================================================
// Sandpack Store 类型
// ============================================================================

/** 视图模式 */
export type ViewMode = "preview" | "code";

/** Sandpack 文件格式 */
export type SandpackFiles = Record<string, { code: string }>;

/** Sandpack Store 状态与方法 */
export interface SandpackStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  /** 编辑器标签状态 */
  openFiles: string[];
  setOpenFiles: (files: string[]) => void;
  activeFile: string;
  setActiveFile: (file: string) => void;

  /** 当前编辑工作区文件 */
  workspaceFiles: SandpackFiles | null;
  workspaceFolders: string[];
  setWorkspaceFiles: (files: SandpackFiles | null) => void;
  updateWorkspaceFile: (path: string, code: string) => void;
  createWorkspaceFile: (path: string, code?: string) => string | null;
  createWorkspaceFolder: (path: string) => string | null;
  renameWorkspacePath: (fromPath: string, toPath: string) => string | null;
  deleteWorkspacePath: (path: string) => boolean;

  /** AI 生成的文件 */
  generatedFiles: SandpackFiles | null;
  setGeneratedFiles: (files: Record<string, string>) => void;
  clearGeneratedFiles: () => void;

  /** 组装状态 */
  isAssembling: boolean;
  setIsAssembling: (isAssembling: boolean) => void;
}

// ============================================================================
// Chat Store 类型
// ============================================================================

/** 版本变更记录 */
export interface VersionChanges {
  added: string[]; // 新增的文件路径
  modified: string[]; // 修改的文件路径
  deleted: string[]; // 删除的文件路径
}

/** 项目版本 */
export interface ProjectVersion {
  versionId: string; // 版本唯一ID "v1", "v2", "v3"...
  versionNumber: number; // 版本号 1, 2, 3...
  threadId: string; // 对应的 LangGraph thread_id

  /** 版本元数据 */
  operation: "create" | "edit"; // 操作类型：创建 or 编辑
  prompt: string; // 用户输入的需求描述
  timestamp: number; // 创建时间戳

  /** 文件快照 */
  files: Record<string, string> | null; // 该版本生成的所有文件
  fileCount: number; // 文件数量

  /** 变更记录（相对于上一版本） */
  changes?: VersionChanges;
}

/** 思维链项的接口 (参考 ant-design/x 的 ThoughtItem) */
export interface ThoughtItem {
  key: string;
  title: ReactNode;
  status?: "pending" | "success" | "error" | "cancelled";
  description?: ReactNode;
  content?: ReactNode; // 存储具体的输出结果 (JSON/Text)

  /** 阶段聚合相关字段 */
  type?: "node" | "phase" | "history"; // 类型：节点级 or 阶段级 or 历史记录
  phase?: string; // 所属阶段
  nodeCount?: number; // 阶段包含的节点数（仅 type=phase 时使用）
  completedNodes?: string[]; // 已完成的节点列表（仅 type=phase 时使用）
  expanded?: boolean; // 阶段/历史是否展开（type=phase/history 时使用）
  nodeDetails?: ThoughtItem[]; // 节点详细信息（用于展开显示）
  historyThoughts?: ThoughtItem[]; // 历史思维链（仅 type=history 时使用）
  timestamp?: number; // 创建时间戳（仅 type=history 时使用，用于显示时间）
}

/** Chat Store 状态与方法 */
export interface ChatState {
  /** 项目管理 */
  currentProjectId: string; // 当前项目 ID
  projectName: string; // 当前项目名称

  /** 版本管理 */
  currentVersion: number; // 当前版本号
  versions: ProjectVersion[]; // 版本历史列表

  /** 流程类型 */
  currentFlow: FlowType | null; // 当前流程类型（traditional / figma）

  messages: ChatMessage[]; // 纯消息数据，不含 thoughts
  messageThoughts: Record<string, ThoughtItem[]>; // messageId -> thoughts 映射
  isLoading: boolean;
  phaseCompletion: Record<string, { completed: number; total: number }>; // 阶段完成进度

  /** Flow Actions */
  setCurrentFlow: (flow: FlowType) => void; // 设置当前流程类型

  /** Project Actions */
  createNewProject: (name?: string) => void; // 创建新项目
  setCurrentProject: (projectId: string, name?: string) => void; // 切换项目
  resetProject: () => void; // 重置当前项目（清空消息和思维链）
  updateProjectName: (name: string) => void; // 更新项目名称

  /** Version Actions */
  saveVersion: (version: Omit<ProjectVersion, "versionId">) => void; // 保存版本快照
  incrementVersion: () => number; // 递增版本号并返回新版本号
  getCurrentThreadId: () => string; // 获取当前版本的 threadId

  /** Actions */
  addMessage: (message: ChatMessage) => void;
  setLoading: (loading: boolean) => void;

  /** ThoughtChain Actions */
  addThought: (messageId: string, thought: ThoughtItem) => void;
  updateThought: (messageId: string, key: string, updates: Partial<ThoughtItem>) => void;
  archiveThoughts: (messageId: string) => void;

  /** Phase Actions */
  updatePhaseProgress: (phase: string) => void;
  collapsePhase: (messageId: string, phase: string) => void;
  togglePhaseExpansion: (phaseKey: string) => void;

  /** History Actions */
  toggleHistoryExpansion: (historyKey: string) => void;
}
