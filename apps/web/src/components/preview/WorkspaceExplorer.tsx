"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { SandpackFiles } from "@/types/store";

type TreeNode =
  | {
      type: "folder";
      name: string;
      path: string;
      children: TreeNode[];
    }
  | {
      type: "file";
      name: string;
      path: string;
    };

interface WorkspaceExplorerProps {
  files: SandpackFiles | null;
  folders: string[];
  activeFile: string;
  onOpenFile: (path: string) => void;
  onCreateFile: (path: string, code?: string) => string | null;
  onCreateFolder: (path: string) => string | null;
  onRenamePath: (fromPath: string, toPath: string) => string | null;
  onDeletePath: (path: string) => boolean;
}

interface TreeFolder {
  type: "folder";
  name: string;
  path: string;
  children: Map<string, TreeFolder | TreeFile>;
}

interface TreeFile {
  type: "file";
  name: string;
  path: string;
}

type ComposerMode = "file" | "folder" | null;

function buildTree(files: SandpackFiles | null, folders: string[]): TreeNode[] {
  const root: TreeFolder = {
    type: "folder",
    name: "",
    path: "/",
    children: new Map(),
  };

  const ensureFolder = (folderPath: string) => {
    const segments = folderPath.split("/").filter(Boolean);
    let current = root;
    let currentPath = "";

    for (const segment of segments) {
      currentPath += `/${segment}`;
      const existing = current.children.get(segment);
      if (existing?.type === "folder") {
        current = existing;
        continue;
      }

      const nextFolder: TreeFolder = {
        type: "folder",
        name: segment,
        path: currentPath,
        children: new Map(),
      };
      current.children.set(segment, nextFolder);
      current = nextFolder;
    }
  };

  folders.forEach((folderPath) => {
    if (folderPath !== "/") {
      ensureFolder(folderPath);
    }
  });

  Object.keys(files || {})
    .sort((left, right) => left.localeCompare(right))
    .forEach((filePath) => {
      const segments = filePath.split("/").filter(Boolean);
      if (segments.length === 0) {
        return;
      }

      const parentSegments = segments.slice(0, -1);
      const fileName = segments[segments.length - 1];
      let current = root;

      if (parentSegments.length > 0) {
        ensureFolder(`/${parentSegments.join("/")}`);
        parentSegments.forEach((segment) => {
          const nextNode = current.children.get(segment);
          if (nextNode?.type === "folder") {
            current = nextNode;
          }
        });
      }

      current.children.set(fileName, {
        type: "file",
        name: fileName,
        path: filePath,
      });
    });

  const toNodes = (folder: TreeFolder): TreeNode[] =>
    Array.from(folder.children.values())
      .sort((left, right) => {
        if (left.type !== right.type) {
          return left.type === "folder" ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      })
      .map((child) =>
        child.type === "folder"
          ? {
              type: "folder",
              name: child.name,
              path: child.path,
              children: toNodes(child),
            }
          : {
              type: "file",
              name: child.name,
              path: child.path,
            },
      );

  return toNodes(root);
}

function getSuggestedFilePath(activeFile: string) {
  const segments = activeFile.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "/NewFile.tsx";
  }

  return `/${segments.slice(0, -1).join("/")}/NewFile.tsx`;
}

function getSuggestedFolderPath(activeFile: string) {
  const segments = activeFile.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return "/new-folder";
  }

  return `/${segments.slice(0, -1).join("/")}/new-folder`;
}

function getAncestorFolders(path: string) {
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [];
  }

  const ancestors: string[] = [];
  const isLikelyFile = /\.[^/]+$/.test(segments[segments.length - 1]);
  const folderSegments = isLikelyFile ? segments.slice(0, -1) : segments;
  let current = "";

  folderSegments.forEach((segment) => {
    current += `/${segment}`;
    ancestors.push(current);
  });

  return ancestors;
}

export function WorkspaceExplorer({
  files,
  folders,
  activeFile,
  onOpenFile,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
}: WorkspaceExplorerProps) {
  const tree = useMemo(() => buildTree(files, folders), [files, folders]);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [composerMode, setComposerMode] = useState<ComposerMode>(null);
  const [composerValue, setComposerValue] = useState("");
  const [composerParentPath, setComposerParentPath] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);
  const [highlightedPath, setHighlightedPath] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const visiblePendingDeletePath = useMemo(() => {
    if (!pendingDeletePath) {
      return null;
    }

    const fileExists = Boolean(files?.[pendingDeletePath]);
    const folderExists = folders.includes(pendingDeletePath);
    return fileExists || folderExists ? pendingDeletePath : null;
  }, [files, folders, pendingDeletePath]);

  const forcedExpandedFolders = useMemo(
    () => new Set(getAncestorFolders(highlightedPath ?? "")),
    [highlightedPath],
  );

  useEffect(() => {
    if (!highlightedPath) {
      return;
    }

    const timer = window.setTimeout(() => {
      itemRefs.current[highlightedPath]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }, 80);

    const clearTimer = window.setTimeout(() => {
      setHighlightedPath((current) => (current === highlightedPath ? null : current));
    }, 1800);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightedPath]);

  const submitComposer = () => {
    const value = composerValue.trim();
    if (!value) {
      toast.error("请输入有效路径");
      return;
    }

    if (composerMode === "folder") {
      const nextPath = onCreateFolder(value);
      if (!nextPath) {
        toast.error("创建目录失败，请检查路径");
        return;
      }

      toast.success(`已创建目录 ${nextPath}`);
      setHighlightedPath(nextPath);
      setComposerMode(null);
      setComposerParentPath(null);
      return;
    }

    const nextPath = onCreateFile(value);
    if (!nextPath) {
      toast.error("创建文件失败，请检查路径或是否与现有文件冲突");
      return;
    }

    toast.success(`已创建文件 ${nextPath}`);
    onOpenFile(nextPath);
    setHighlightedPath(nextPath);
    setComposerMode(null);
    setComposerParentPath(null);
  };

  const openComposer = (mode: ComposerMode, parentPath?: string) => {
    const nextParentPath = parentPath ?? null;
    const nextValue = nextParentPath
      ? mode === "folder"
        ? `${nextParentPath}/new-folder`
        : `${nextParentPath}/NewFile.tsx`
      : mode === "folder"
        ? getSuggestedFolderPath(activeFile)
        : getSuggestedFilePath(activeFile);

    setPendingDeletePath(null);
    setEditingPath(null);
    setComposerParentPath(nextParentPath);
    setComposerMode(mode);
    setComposerValue(nextValue);
  };

  const startRename = (path: string) => {
    setEditingPath(path);
    setEditingValue(path);
    setPendingDeletePath(null);
    setComposerMode(null);
    setComposerParentPath(null);
  };

  const submitRename = (path: string, isFile: boolean) => {
    const value = editingValue.trim();
    if (!value || value === path) {
      setEditingPath(null);
      return;
    }

    const nextPath = onRenamePath(path, value);
    if (!nextPath) {
      toast.error("重命名失败，可能是路径冲突或包含受保护文件");
      return;
    }

    toast.success(`已重命名为 ${nextPath}`);
    setEditingPath(null);
    setHighlightedPath(nextPath);
    if (isFile) {
      onOpenFile(nextPath);
    }
  };

  const submitDelete = (path: string) => {
    const deleted = onDeletePath(path);
    if (!deleted) {
      toast.error("删除失败，该路径可能受保护或不存在");
      return;
    }

    toast.success(`已删除 ${path}`);
    setPendingDeletePath(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-3 py-2">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-700">工作区文件</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                composerMode === "folder" && !composerParentPath
                  ? setComposerMode(null)
                  : openComposer("folder")
              }
              className={`cursor-pointer rounded-md p-1 transition-colors ${
                composerMode === "folder" && !composerParentPath
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
              title="新建目录"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() =>
                composerMode === "file" && !composerParentPath
                  ? setComposerMode(null)
                  : openComposer("file")
              }
              className={`cursor-pointer rounded-md p-1 transition-colors ${
                composerMode === "file" && !composerParentPath
                  ? "bg-gray-900 text-white"
                  : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              }`}
              title="新建文件"
            >
              <FilePlus2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {composerMode ? (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
            <div className="text-[11px] font-medium text-gray-600">
              {composerMode === "file" ? "输入新文件路径" : "输入新目录路径"}
            </div>
            <input
              autoFocus
              value={composerValue}
              onChange={(event) => setComposerValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitComposer();
                }
                if (event.key === "Escape") {
                  setComposerMode(null);
                }
              }}
              className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800 transition-colors outline-none focus:border-gray-400"
              placeholder={
                composerMode === "file" ? "/components/Header.tsx" : "/components/common"
              }
            />
            <div className="flex items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  setComposerMode(null);
                  setComposerParentPath(null);
                }}
                className="cursor-pointer rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitComposer}
                className="cursor-pointer rounded-md bg-gray-900 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-gray-800"
              >
                创建
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[11px] leading-4 text-gray-400">
            目录按路径管理，新增文件时可直接输入嵌套路径。
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {tree.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-xs text-gray-400">
            暂无文件
          </div>
        ) : (
          <div className="space-y-0.5">
            {tree.map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                depth={0}
                activeFile={activeFile}
                collapsedFolders={collapsedFolders}
                forcedExpandedFolders={forcedExpandedFolders}
                editingPath={editingPath}
                editingValue={editingValue}
                pendingDeletePath={visiblePendingDeletePath}
                highlightedPath={highlightedPath}
                registerItemRef={(path, element) => {
                  itemRefs.current[path] = element;
                }}
                composerMode={composerMode}
                composerParentPath={composerParentPath}
                onToggleFolder={(path) =>
                  setCollapsedFolders((prev) => {
                    const next = { ...prev };
                    if (next[path]) {
                      delete next[path];
                    } else {
                      next[path] = true;
                    }
                    return next;
                  })
                }
                onOpenFile={onOpenFile}
                onOpenComposer={openComposer}
                onStartRename={startRename}
                onRenameValueChange={setEditingValue}
                onSubmitRename={submitRename}
                onCancelRename={() => setEditingPath(null)}
                onAskDelete={setPendingDeletePath}
                onConfirmDelete={submitDelete}
                onCancelDelete={() => setPendingDeletePath(null)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  activeFile,
  collapsedFolders,
  forcedExpandedFolders,
  editingPath,
  editingValue,
  pendingDeletePath,
  highlightedPath,
  registerItemRef,
  composerMode,
  composerParentPath,
  onToggleFolder,
  onOpenFile,
  onOpenComposer,
  onStartRename,
  onRenameValueChange,
  onSubmitRename,
  onCancelRename,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  node: TreeNode;
  depth: number;
  activeFile: string;
  collapsedFolders: Record<string, boolean>;
  forcedExpandedFolders: Set<string>;
  editingPath: string | null;
  editingValue: string;
  pendingDeletePath: string | null;
  highlightedPath: string | null;
  registerItemRef: (path: string, element: HTMLDivElement | null) => void;
  composerMode: ComposerMode;
  composerParentPath: string | null;
  onToggleFolder: (path: string) => void;
  onOpenFile: (path: string) => void;
  onOpenComposer: (mode: ComposerMode, parentPath?: string) => void;
  onStartRename: (path: string) => void;
  onRenameValueChange: (value: string) => void;
  onSubmitRename: (path: string, isFile: boolean) => void;
  onCancelRename: () => void;
  onAskDelete: (path: string) => void;
  onConfirmDelete: (path: string) => void;
  onCancelDelete: () => void;
}) {
  const paddingLeft = 8 + depth * 14;
  const isEditing = editingPath === node.path;
  const isPendingDelete = pendingDeletePath === node.path;
  const isHighlighted = highlightedPath === node.path;

  if (node.type === "file") {
    const isActive = node.path === activeFile;

    return (
      <div ref={(element) => registerItemRef(node.path, element)}>
        <div
          className={`group flex items-center gap-1 rounded-md pr-1 transition-colors ${
            isActive
              ? "bg-slate-100 text-slate-900 ring-1 ring-slate-200"
              : isHighlighted
                ? "bg-blue-50 text-gray-700 ring-1 ring-blue-100"
                : "text-gray-600 hover:bg-gray-100"
          }`}
          style={{ paddingLeft }}
        >
          {isEditing ? (
            <div className="flex min-w-0 flex-1 items-center gap-1 py-1">
              <div className="flex w-4 shrink-0 justify-center">
                <span className="h-3.5 w-3.5" />
              </div>
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <input
                autoFocus
                value={editingValue}
                onChange={(event) => onRenameValueChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onSubmitRename(node.path, true);
                  }
                  if (event.key === "Escape") {
                    onCancelRename();
                  }
                }}
                className="h-7 min-w-0 flex-1 rounded border border-white/15 bg-transparent px-2 text-xs text-inherit outline-none"
              />
              <ActionIconButton
                title="保存"
                active={isActive}
                onClick={() => onSubmitRename(node.path, true)}
              >
                <Check className="h-3 w-3" />
              </ActionIconButton>
              <ActionIconButton title="取消" active={isActive} onClick={onCancelRename}>
                <X className="h-3 w-3" />
              </ActionIconButton>
            </div>
          ) : isPendingDelete ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
              <div className="flex w-4 shrink-0 justify-center">
                <span className="h-3.5 w-3.5" />
              </div>
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-xs" title={node.path}>
                删除 {node.name}？
              </span>
              <ActionTextButton active={isActive} onClick={() => onConfirmDelete(node.path)}>
                删除
              </ActionTextButton>
              <ActionTextButton active={isActive} onClick={onCancelDelete}>
                取消
              </ActionTextButton>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onOpenFile(node.path)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 text-left"
              >
                <div className="flex w-4 shrink-0 justify-center">
                  <span className="h-3.5 w-3.5" />
                </div>
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate text-xs" title={node.path}>
                  {node.name}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <ActionIconButton
                  title="重命名"
                  active={isActive}
                  onClick={() => onStartRename(node.path)}
                >
                  <Pencil className="h-3 w-3" />
                </ActionIconButton>
                <ActionIconButton
                  title="删除"
                  active={isActive}
                  onClick={() => onAskDelete(node.path)}
                >
                  <Trash2 className="h-3 w-3" />
                </ActionIconButton>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const isExpanded = forcedExpandedFolders.has(node.path) || !collapsedFolders[node.path];

  return (
    <div ref={(element) => registerItemRef(node.path, element)}>
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 transition-colors ${
          isHighlighted ? "bg-blue-50 ring-1 ring-blue-100" : "hover:bg-gray-100"
        } text-gray-700`}
        style={{ paddingLeft }}
      >
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1 py-1">
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <input
              autoFocus
              value={editingValue}
              onChange={(event) => onRenameValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  onSubmitRename(node.path, false);
                }
                if (event.key === "Escape") {
                  onCancelRename();
                }
              }}
              className="h-7 min-w-0 flex-1 rounded border border-gray-200 bg-white px-2 text-xs text-gray-800 outline-none"
            />
            <ActionIconButton
              title="保存"
              active={false}
              onClick={() => onSubmitRename(node.path, false)}
            >
              <Check className="h-3 w-3" />
            </ActionIconButton>
            <ActionIconButton title="取消" active={false} onClick={onCancelRename}>
              <X className="h-3 w-3" />
            </ActionIconButton>
          </div>
        ) : isPendingDelete ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 py-1.5">
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
            <span className="min-w-0 flex-1 truncate text-xs" title={node.path}>
              删除 {node.name}？
            </span>
            <ActionTextButton active={false} onClick={() => onConfirmDelete(node.path)}>
              删除
            </ActionTextButton>
            <ActionTextButton active={false} onClick={onCancelDelete}>
              取消
            </ActionTextButton>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onToggleFolder(node.path)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 py-2 text-left"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              )}
              <span className="truncate text-xs font-medium" title={node.path}>
                {node.name}
              </span>
            </button>
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <ActionIconButton
                title="在此目录新建文件"
                active={false}
                onClick={() => onOpenComposer("file", node.path)}
              >
                <FilePlus2 className="h-3 w-3" />
              </ActionIconButton>
              <ActionIconButton
                title="在此目录新建目录"
                active={false}
                onClick={() => onOpenComposer("folder", node.path)}
              >
                <FolderPlus className="h-3 w-3" />
              </ActionIconButton>
              <ActionIconButton
                title="重命名目录"
                active={false}
                onClick={() => onStartRename(node.path)}
              >
                <Pencil className="h-3 w-3" />
              </ActionIconButton>
              <ActionIconButton
                title="删除目录"
                active={false}
                onClick={() => onAskDelete(node.path)}
              >
                <Trash2 className="h-3 w-3" />
              </ActionIconButton>
            </div>
          </>
        )}
      </div>

      {isExpanded && node.children.length > 0 && (
        <div>
          {node.children.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              activeFile={activeFile}
              collapsedFolders={collapsedFolders}
              forcedExpandedFolders={forcedExpandedFolders}
              editingPath={editingPath}
              editingValue={editingValue}
              pendingDeletePath={pendingDeletePath}
              highlightedPath={highlightedPath}
              registerItemRef={registerItemRef}
              composerMode={composerMode}
              composerParentPath={composerParentPath}
              onToggleFolder={onToggleFolder}
              onOpenFile={onOpenFile}
              onOpenComposer={onOpenComposer}
              onStartRename={onStartRename}
              onRenameValueChange={onRenameValueChange}
              onSubmitRename={onSubmitRename}
              onCancelRename={onCancelRename}
              onAskDelete={onAskDelete}
              onConfirmDelete={onConfirmDelete}
              onCancelDelete={onCancelDelete}
            />
          ))}
        </div>
      )}
      {isExpanded && node.children.length === 0 && !isEditing && !isPendingDelete && (
        <div className="py-1.5 text-[11px] text-gray-400" style={{ paddingLeft: paddingLeft + 34 }}>
          空目录
        </div>
      )}
    </div>
  );
}

function ActionIconButton({
  children,
  active,
  title,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`cursor-pointer rounded p-1 transition-colors ${
        active ? "hover:bg-slate-200" : "hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function ActionTextButton({
  children,
  active,
  onClick,
}: {
  children: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
        active ? "hover:bg-slate-200" : "hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}
