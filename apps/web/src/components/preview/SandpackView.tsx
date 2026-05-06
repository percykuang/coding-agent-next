// Sandpack 代码预览组件
"use client";

import {
  SandpackLayout,
  SandpackPreview,
  SandpackCodeEditor,
  useSandpack,
  useActiveCode,
} from "@codesandbox/sandpack-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import dynamic from "next/dynamic";
import { useSandpackStore } from "@/store/sandpackStore";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getReactTS_Template } from "@/services/api";
import { BuildingLoadingOverlay } from "./BuildingLoadingOverlay";
import { WorkspaceExplorer } from "./WorkspaceExplorer";

// Client-only provider to prevent hydration mismatch
const SandpackProvider = dynamic(
  () => import("@codesandbox/sandpack-react").then((mod) => mod.SandpackProvider),
  {
    ssr: false,
    loading: () => <div className="h-full w-full bg-white" />,
  },
);

const SIDEBAR_MIN_WIDTH = 220;
const SIDEBAR_MAX_WIDTH = 520;
const SIDEBAR_DEFAULT_WIDTH = 260;

export function SandpackView() {
  const {
    viewMode,
    generatedFiles,
    workspaceFiles,
    workspaceFolders,
    openFiles,
    activeFile,
    setOpenFiles,
    setActiveFile,
    setWorkspaceFiles,
    updateWorkspaceFile,
    createWorkspaceFile,
    createWorkspaceFolder,
    renameWorkspacePath,
    deleteWorkspacePath,
    isAssembling,
    setIsAssembling,
  } = useSandpackStore();
  const [templateFiles, setTemplateFiles] = useState<Record<string, { code: string }>>({});
  const [loading, setLoading] = useState(true);

  // 将 templateFiles 暴露给全局（供 PreviewToolbar 使用）
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__templateFiles = templateFiles;
    }
  }, [templateFiles]);

  // 加载默认模板
  useEffect(() => {
    async function load() {
      try {
        const template = await getReactTS_Template();
        setTemplateFiles(template);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // 当模板或新生成代码到达时，初始化工作区。
  // 后续用户编辑只更新 workspaceFiles，不再回退到 generatedFiles 快照。
  useEffect(() => {
    const nextFiles = generatedFiles ? { ...templateFiles, ...generatedFiles } : templateFiles;

    if (Object.keys(nextFiles).length === 0) {
      return;
    }

    setWorkspaceFiles(nextFiles);
  }, [generatedFiles, templateFiles, setWorkspaceFiles]);

  // 使用稳定引用，避免父组件普通重渲染时把外部 files 重新灌回 Sandpack。
  const files = useMemo(() => workspaceFiles ?? templateFiles, [workspaceFiles, templateFiles]);

  // 生成唯一 key，当 generatedFiles 变化时强制 SandpackProvider 重新挂载
  const sandpackKey = useMemo(() => {
    if (!generatedFiles) return "template";

    const fileSignature = Object.entries(generatedFiles)
      .sort(([leftPath], [rightPath]) => leftPath.localeCompare(rightPath))
      .map(([filePath, fileContent]) => `${filePath}:${fileContent.code.length}`)
      .join("|");

    return `generated-${fileSignature}`;
  }, [generatedFiles]);

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-50 text-gray-500">
        正在加载 React 模板...
      </div>
    );
  }

  return (
    <SandpackProvider
      key={sandpackKey}
      template="react-ts"
      theme="light"
      files={files}
      options={{
        externalResources: ["https://cdn.tailwindcss.com"],
        visibleFiles: openFiles,
        activeFile,
        autorun: true,
        autoReload: false,
        recompileMode: "delayed",
        recompileDelay: 800,
      }}
      style={{ height: "100%", width: "100%" }}
    >
      <div className="sandpack-wrapper relative h-full w-full border-none">
        {/* Loading Overlay - 覆盖在 Sandpack 之上，让 Sandpack 在后台加载 */}
        {isAssembling && <BuildingLoadingOverlay />}

        <SandpackLayout style={{ height: "100%", border: "none", borderRadius: 0 }}>
          <SandpackContent
            viewMode={viewMode}
            onCodeChange={updateWorkspaceFile}
            onEditorStateChange={(nextOpenFiles, nextActiveFile) => {
              setOpenFiles(nextOpenFiles);
              setActiveFile(nextActiveFile);
            }}
            desiredOpenFiles={openFiles}
            desiredActiveFile={activeFile}
            workspaceFiles={workspaceFiles}
            workspaceFolders={workspaceFolders}
            onCreateWorkspaceFile={createWorkspaceFile}
            onCreateWorkspaceFolder={createWorkspaceFolder}
            onRenameWorkspacePath={renameWorkspacePath}
            onDeleteWorkspacePath={deleteWorkspacePath}
            onReady={() => {
              // Sandpack 加载完成后关闭组装 loading
              if (isAssembling) {
                setIsAssembling(false);
              }
            }}
          />
        </SandpackLayout>
      </div>
    </SandpackProvider>
  );
}

function SandpackContent({
  viewMode,
  onCodeChange,
  onEditorStateChange,
  desiredOpenFiles,
  desiredActiveFile,
  workspaceFiles,
  workspaceFolders,
  onCreateWorkspaceFile,
  onCreateWorkspaceFolder,
  onRenameWorkspacePath,
  onDeleteWorkspacePath,
  onReady,
}: {
  viewMode: "preview" | "code";
  onCodeChange: (path: string, code: string) => void;
  onEditorStateChange: (openFiles: string[], activeFile: string) => void;
  desiredOpenFiles: string[];
  desiredActiveFile: string;
  workspaceFiles: Record<string, { code: string }> | null;
  workspaceFolders: string[];
  onCreateWorkspaceFile: (path: string, code?: string) => string | null;
  onCreateWorkspaceFolder: (path: string) => string | null;
  onRenameWorkspacePath: (fromPath: string, toPath: string) => string | null;
  onDeleteWorkspacePath: (path: string) => boolean;
  onReady?: () => void;
}) {
  const { sandpack } = useSandpack();
  const { code } = useActiveCode();
  const lastPreviewCode = useRef<string | undefined>(code);
  const pendingRefresh = useRef(false);
  const pendingSync = useRef<{ path: string; code: string } | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const hasNotifiedReady = useRef(false);
  const lastReportedEditorStateRef = useRef<{
    activeFile: string;
    visibleFilesSignature: string;
  } | null>(null);
  const resizeStartXRef = useRef(0);
  const resizeStartWidthRef = useRef(SIDEBAR_DEFAULT_WIDTH);

  useEffect(() => {
    if (!isResizingSidebar) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - resizeStartXRef.current;
      const viewportMaxWidth = Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, window.innerWidth * 0.45),
      );
      const nextWidth = Math.min(
        viewportMaxWidth,
        Math.max(SIDEBAR_MIN_WIDTH, resizeStartWidthRef.current + deltaX),
      );
      setSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingSidebar]);

  const handleSidebarResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (!isFileTreeOpen) {
        return;
      }

      event.preventDefault();
      resizeStartXRef.current = event.clientX;
      resizeStartWidthRef.current = sidebarWidth;
      setIsResizingSidebar(true);
    },
    [isFileTreeOpen, sidebarWidth],
  );

  const toggleFileTree = useCallback(() => {
    setIsFileTreeOpen((prev) => {
      const next = !prev;
      if (next && sidebarWidth <= SIDEBAR_MIN_WIDTH) {
        setSidebarWidth(SIDEBAR_DEFAULT_WIDTH);
      }
      return next;
    });
  }, [sidebarWidth]);

  const flushPendingCodeChange = useCallback(() => {
    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    const draft = pendingSync.current;
    if (!draft) {
      return;
    }

    pendingSync.current = null;
    onCodeChange(draft.path, draft.code);
  }, [onCodeChange]);

  // ✨ 监听 Sandpack 预览 iframe 加载完成
  useEffect(() => {
    if (!onReady) return;

    const notifyReady = () => {
      if (hasNotifiedReady.current) return;
      hasNotifiedReady.current = true;
      onReady();
    };

    const tryAttach = () => {
      const iframe = document.querySelector<HTMLIFrameElement>(".sp-preview-iframe");
      if (!iframe) return false;

      try {
        if (iframe.contentDocument?.readyState === "complete") {
          notifyReady();
          return true;
        }
      } catch {
        // 跨域或访问异常时，等待 load 事件
      }

      const handleLoad = () => {
        notifyReady();
      };
      iframe.addEventListener("load", handleLoad, { once: true });
      return true;
    };

    let intervalId: number | undefined;
    if (!tryAttach()) {
      intervalId = window.setInterval(() => {
        if (tryAttach() && intervalId) {
          window.clearInterval(intervalId);
        }
      }, 200);
    }

    return () => {
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [onReady]);

  // 限制 tab 数量
  const MAX_TABS = 4;
  const prevVisibleFilesRef = useRef<string[]>([]);

  void desiredOpenFiles;

  useEffect(() => {
    const visibleFiles = sandpack.visibleFiles;

    // 如果超过最大数量，关闭最早打开的（但不是当前活动的）
    if (visibleFiles.length > MAX_TABS) {
      // 找到新增的文件（当前活动文件）
      const activeFile = sandpack.activeFile;
      // 找到最早打开的文件（排除当前活动文件）
      const fileToClose = visibleFiles.find((f) => f !== activeFile);
      if (fileToClose) {
        sandpack.closeFile(fileToClose);
      }
    }

    // 更新 ref
    prevVisibleFilesRef.current = [...visibleFiles];
  }, [sandpack.visibleFiles, sandpack.activeFile, sandpack]);

  useEffect(() => {
    if (!sandpack.activeFile) {
      return;
    }

    const visibleFilesSignature = sandpack.visibleFiles.join("|");
    const previousState = lastReportedEditorStateRef.current;

    if (
      previousState?.activeFile === sandpack.activeFile &&
      previousState.visibleFilesSignature === visibleFilesSignature
    ) {
      return;
    }

    lastReportedEditorStateRef.current = {
      activeFile: sandpack.activeFile,
      visibleFilesSignature,
    };

    onEditorStateChange(sandpack.visibleFiles, sandpack.activeFile);
  }, [sandpack.visibleFiles, sandpack.activeFile, onEditorStateChange]);

  useEffect(() => {
    if (viewMode === "code" && code !== lastPreviewCode.current) {
      pendingRefresh.current = true;
    }
  }, [code, viewMode]);

  useEffect(() => {
    if (!sandpack.activeFile) {
      return;
    }

    pendingSync.current = {
      path: sandpack.activeFile,
      code,
    };

    if (viewMode !== "code") {
      flushPendingCodeChange();
      return;
    }

    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = window.setTimeout(() => {
      flushPendingCodeChange();
    }, 500);
  }, [code, sandpack.activeFile, viewMode, flushPendingCodeChange]);

  useEffect(() => {
    if (viewMode === "preview") {
      flushPendingCodeChange();
    }
  }, [viewMode, flushPendingCodeChange]);

  useEffect(
    () => () => {
      flushPendingCodeChange();
    },
    [flushPendingCodeChange],
  );

  useEffect(() => {
    if (viewMode !== "preview") {
      return;
    }

    if (pendingRefresh.current) {
      sandpack.runSandpack();
      pendingRefresh.current = false;
    }

    lastPreviewCode.current = code;
  }, [viewMode, sandpack, code]);

  const handleOpenFile = useCallback(
    (path: string) => {
      sandpack.openFile(path);
    },
    [sandpack],
  );

  return (
    <div className="relative h-full w-full bg-white">
      <div
        className={viewMode === "preview" ? "h-full" : "hidden"}
        aria-hidden={viewMode !== "preview"}
      >
        <SandpackPreview
          style={{ height: "100%" }}
          showOpenInCodeSandbox={false}
          showRefreshButton={true}
        />
      </div>
      <div className={viewMode === "code" ? "h-full" : "hidden"} aria-hidden={viewMode !== "code"}>
        <div className="relative flex h-full w-full overflow-hidden">
          <div
            className={`relative flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 ${
              isResizingSidebar ? "" : "transition-[width] duration-200 ease-out"
            } ${isFileTreeOpen ? "" : "border-none"}`}
            style={{ width: isFileTreeOpen ? sidebarWidth : 0 }}
          >
            <div
              className={`h-full w-full overflow-y-auto transition-opacity duration-300 ${
                isFileTreeOpen ? "opacity-100" : "opacity-0"
              }`}
            >
              <WorkspaceExplorer
                files={workspaceFiles}
                folders={workspaceFolders}
                activeFile={desiredActiveFile}
                onOpenFile={handleOpenFile}
                onCreateFile={onCreateWorkspaceFile}
                onCreateFolder={onCreateWorkspaceFolder}
                onRenamePath={onRenameWorkspacePath}
                onDeletePath={onDeleteWorkspacePath}
              />
            </div>
          </div>

          {isFileTreeOpen ? (
            <div
              className="relative z-10 h-full w-2 flex-shrink-0 cursor-col-resize bg-transparent"
              onMouseDown={handleSidebarResizeStart}
              aria-hidden="true"
            >
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200" />
              <div className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-transparent transition-colors hover:bg-gray-300" />
            </div>
          ) : null}

          {/* 编辑器容器 */}
          <div className="relative h-full min-w-0 flex-1 overflow-hidden">
            <SandpackCodeEditor
              style={{ height: "100%", width: "100%" }}
              showTabs={true}
              showLineNumbers={true}
              showInlineErrors={true}
              wrapContent={true}
              closableTabs={true}
            />
          </div>

          {/* Toggle Button Overlaid on the Divider line */}
          <button
            type="button"
            onClick={toggleFileTree}
            className={`absolute top-7 z-20 flex h-6 w-6 cursor-pointer items-center justify-center border border-gray-200 bg-white text-gray-500 shadow-sm transition-all duration-300 hover:text-gray-700 ${
              isFileTreeOpen ? "rounded-full" : "rounded-l-none rounded-r-full border-l-0"
            }`}
            style={{
              left: isFileTreeOpen ? sidebarWidth + 8 : 0,
              transform: isFileTreeOpen ? "translateX(-50%)" : "translateX(0)",
            }}
            aria-label={isFileTreeOpen ? "Collapse file tree" : "Expand file tree"}
          >
            {isFileTreeOpen ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
