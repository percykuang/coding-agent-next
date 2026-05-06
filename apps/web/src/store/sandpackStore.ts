import { create } from "zustand";
import type { SandpackStore, SandpackFiles } from "@/types/store";

export type { SandpackFiles };

const DEFAULT_OPEN_FILES = ["/App.tsx", "/index.tsx", "/styles.css"];
const DEFAULT_ACTIVE_FILE = "/App.tsx";
const PROTECTED_FILES = new Set([
  "/App.tsx",
  "/index.tsx",
  "/styles.css",
  "/package.json",
  "/public/index.html",
]);

function normalizePathSlashes(input: string) {
  return input.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function normalizeWorkspacePath(input: string, kind: "file" | "folder") {
  const trimmed = normalizePathSlashes(input.trim());
  if (!trimmed) {
    return null;
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized =
    kind === "folder" && withLeadingSlash.length > 1
      ? withLeadingSlash.replace(/\/+$/, "")
      : withLeadingSlash;

  if (normalized === "/") {
    return kind === "folder" ? "/" : null;
  }

  return normalized;
}

function uniquePaths(paths: string[]) {
  return Array.from(new Set(paths));
}

function inferFoldersFromFiles(files: SandpackFiles | null) {
  if (!files) {
    return [];
  }

  const folders = new Set<string>();

  Object.keys(files).forEach((filePath) => {
    const segments = filePath.split("/").filter(Boolean);
    if (segments.length <= 1) {
      return;
    }

    let current = "";
    segments.slice(0, -1).forEach((segment) => {
      current += `/${segment}`;
      folders.add(current);
    });
  });

  return Array.from(folders).sort((left, right) => left.localeCompare(right));
}

function inferFoldersFromPath(filePath: string) {
  const normalized = normalizeWorkspacePath(filePath, "file");
  if (!normalized) {
    return [];
  }

  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return [];
  }

  const folders: string[] = [];
  let current = "";
  segments.slice(0, -1).forEach((segment) => {
    current += `/${segment}`;
    folders.push(current);
  });

  return folders;
}

function renameByPrefix(value: string, fromPath: string, toPath: string) {
  if (value === fromPath) {
    return toPath;
  }

  if (!value.startsWith(`${fromPath}/`)) {
    return value;
  }

  return `${toPath}${value.slice(fromPath.length)}`;
}

function isProtectedPath(path: string) {
  return PROTECTED_FILES.has(path);
}

function pickFallbackActiveFile(files: SandpackFiles, preferred?: string[]) {
  if (preferred) {
    for (const path of preferred) {
      if (files[path]) {
        return path;
      }
    }
  }

  if (files[DEFAULT_ACTIVE_FILE]) {
    return DEFAULT_ACTIVE_FILE;
  }

  return Object.keys(files).sort((left, right) => left.localeCompare(right))[0] || "";
}

function mergeFolders(files: SandpackFiles, folders: string[]) {
  return uniquePaths([...folders, ...inferFoldersFromFiles(files)]).sort((left, right) =>
    left.localeCompare(right),
  );
}

function buildStarterCode(path: string) {
  const fileName = path.split("/").pop() || "";

  if (fileName.endsWith(".tsx")) {
    const componentName = fileName
      .replace(/\.tsx$/, "")
      .replace(/(^\w|-\w|_\w)/g, (match) => match.replace(/[-_]/g, "").toUpperCase());

    return `export default function ${componentName || "NewComponent"}() {\n  return <div>${componentName || "NewComponent"}</div>;\n}\n`;
  }

  if (fileName.endsWith(".ts")) {
    return "export {};\n";
  }

  if (fileName.endsWith(".css")) {
    return "";
  }

  if (fileName.endsWith(".json")) {
    return "{\n  \n}\n";
  }

  return "";
}

export const useSandpackStore = create<SandpackStore>((set, get) => ({
  viewMode: "preview",
  setViewMode: (mode) => set({ viewMode: mode }),

  openFiles: DEFAULT_OPEN_FILES,
  setOpenFiles: (files) =>
    set((state) => {
      const nextFiles = files.length > 0 ? files : DEFAULT_OPEN_FILES;
      if (
        state.openFiles.length === nextFiles.length &&
        state.openFiles.every((file, index) => file === nextFiles[index])
      ) {
        return state;
      }

      return { openFiles: nextFiles };
    }),
  activeFile: DEFAULT_ACTIVE_FILE,
  setActiveFile: (file) =>
    set((state) =>
      state.activeFile === file ? state : { activeFile: file || DEFAULT_ACTIVE_FILE },
    ),

  workspaceFiles: null,
  workspaceFolders: [],
  setWorkspaceFiles: (files) =>
    set({
      workspaceFiles: files,
      workspaceFolders: inferFoldersFromFiles(files),
    }),
  updateWorkspaceFile: (path, code) =>
    set((state) => {
      if (!state.workspaceFiles) {
        return state;
      }

      const current = state.workspaceFiles[path];
      if (current?.code === code) {
        return state;
      }

      const nextFiles = {
        ...state.workspaceFiles,
        [path]: {
          ...(current ?? { code: "" }),
          code,
        },
      };

      return {
        workspaceFiles: nextFiles,
        workspaceFolders: mergeFolders(nextFiles, state.workspaceFolders),
      };
    }),
  createWorkspaceFile: (path, code) => {
    const normalizedPath = normalizeWorkspacePath(path, "file");
    if (!normalizedPath) {
      return null;
    }

    set((state) => {
      if (!state.workspaceFiles) {
        return state;
      }

      const nextFiles = {
        ...state.workspaceFiles,
        [normalizedPath]: {
          code:
            state.workspaceFiles[normalizedPath]?.code ?? code ?? buildStarterCode(normalizedPath),
        },
      };

      const nextOpenFiles = uniquePaths([...state.openFiles, normalizedPath]);
      const nextFolders = mergeFolders(nextFiles, [
        ...state.workspaceFolders,
        ...inferFoldersFromPath(normalizedPath),
      ]);

      return {
        workspaceFiles: nextFiles,
        workspaceFolders: nextFolders,
        openFiles: nextOpenFiles,
        activeFile: normalizedPath,
      };
    });

    return normalizedPath;
  },
  createWorkspaceFolder: (path) => {
    const normalizedPath = normalizeWorkspacePath(path, "folder");
    if (!normalizedPath || normalizedPath === "/") {
      return null;
    }

    set((state) => ({
      workspaceFolders: uniquePaths([...state.workspaceFolders, normalizedPath]).sort(
        (left, right) => left.localeCompare(right),
      ),
    }));

    return normalizedPath;
  },
  renameWorkspacePath: (fromPath, toPath) => {
    const state = get();
    if (!state.workspaceFiles) {
      return null;
    }

    const normalizedFromFile = normalizeWorkspacePath(fromPath, "file");
    const normalizedToFile = normalizeWorkspacePath(toPath, "file");
    const normalizedFromFolder = normalizeWorkspacePath(fromPath, "folder");
    const normalizedToFolder = normalizeWorkspacePath(toPath, "folder");

    if (normalizedFromFile && state.workspaceFiles[normalizedFromFile] && normalizedToFile) {
      if (
        isProtectedPath(normalizedFromFile) ||
        (normalizedToFile !== normalizedFromFile && Boolean(state.workspaceFiles[normalizedToFile]))
      ) {
        return null;
      }

      set((currentState) => {
        if (!currentState.workspaceFiles) {
          return currentState;
        }

        const nextFiles = { ...currentState.workspaceFiles };
        const targetFile = nextFiles[normalizedFromFile];
        delete nextFiles[normalizedFromFile];
        nextFiles[normalizedToFile] = targetFile;

        const nextOpenFiles = uniquePaths(
          currentState.openFiles.map((file) =>
            file === normalizedFromFile ? normalizedToFile : file,
          ),
        );

        return {
          workspaceFiles: nextFiles,
          workspaceFolders: mergeFolders(nextFiles, currentState.workspaceFolders),
          openFiles: nextOpenFiles,
          activeFile:
            currentState.activeFile === normalizedFromFile
              ? normalizedToFile
              : currentState.activeFile,
        };
      });

      return normalizedToFile;
    }

    if (!normalizedFromFolder || !normalizedToFolder) {
      return null;
    }

    const hasFolder =
      state.workspaceFolders.includes(normalizedFromFolder) ||
      Object.keys(state.workspaceFiles).some(
        (filePath) =>
          filePath === normalizedFromFolder || filePath.startsWith(`${normalizedFromFolder}/`),
      );

    if (!hasFolder) {
      return null;
    }

    const nestedProtected = Object.keys(state.workspaceFiles).some(
      (filePath) =>
        (filePath === normalizedFromFolder || filePath.startsWith(`${normalizedFromFolder}/`)) &&
        isProtectedPath(filePath),
    );

    if (nestedProtected) {
      return null;
    }

    const currentFiles = state.workspaceFiles;
    const nestedTargets = Object.keys(currentFiles)
      .filter(
        (nestedPath) =>
          nestedPath === normalizedFromFolder || nestedPath.startsWith(`${normalizedFromFolder}/`),
      )
      .map((nestedPath) => renameByPrefix(nestedPath, normalizedFromFolder, normalizedToFolder));

    const conflictingFile = Object.keys(currentFiles).some((filePath) => {
      if (filePath === normalizedFromFolder || filePath.startsWith(`${normalizedFromFolder}/`)) {
        return false;
      }

      return nestedTargets.includes(filePath);
    });

    if (conflictingFile) {
      return null;
    }

    set((currentState) => {
      if (!currentState.workspaceFiles) {
        return currentState;
      }

      const nextFiles: SandpackFiles = {};
      Object.entries(currentState.workspaceFiles).forEach(([filePath, file]) => {
        const nextPath = renameByPrefix(filePath, normalizedFromFolder, normalizedToFolder);
        nextFiles[nextPath] = file;
      });

      const nextFolders = uniquePaths(
        currentState.workspaceFolders.map((folderPath) =>
          renameByPrefix(folderPath, normalizedFromFolder, normalizedToFolder),
        ),
      );

      const nextOpenFiles = uniquePaths(
        currentState.openFiles.map((filePath) =>
          renameByPrefix(filePath, normalizedFromFolder, normalizedToFolder),
        ),
      );

      return {
        workspaceFiles: nextFiles,
        workspaceFolders: mergeFolders(nextFiles, nextFolders),
        openFiles: nextOpenFiles,
        activeFile: renameByPrefix(
          currentState.activeFile,
          normalizedFromFolder,
          normalizedToFolder,
        ),
      };
    });

    return normalizedToFolder;
  },
  deleteWorkspacePath: (path) => {
    const state = get();
    if (!state.workspaceFiles) {
      return false;
    }

    const normalizedFilePath = normalizeWorkspacePath(path, "file");
    if (normalizedFilePath && state.workspaceFiles[normalizedFilePath]) {
      if (isProtectedPath(normalizedFilePath)) {
        return false;
      }

      set((currentState) => {
        if (!currentState.workspaceFiles) {
          return currentState;
        }

        const nextFiles = { ...currentState.workspaceFiles };
        delete nextFiles[normalizedFilePath];

        const nextOpenFiles = currentState.openFiles.filter(
          (filePath) => filePath !== normalizedFilePath,
        );
        const nextActiveFile =
          currentState.activeFile === normalizedFilePath
            ? pickFallbackActiveFile(nextFiles, nextOpenFiles)
            : currentState.activeFile;

        return {
          workspaceFiles: nextFiles,
          workspaceFolders: mergeFolders(nextFiles, currentState.workspaceFolders),
          openFiles: nextOpenFiles,
          activeFile: nextActiveFile,
        };
      });

      return true;
    }

    const normalizedFolderPath = normalizeWorkspacePath(path, "folder");
    if (!normalizedFolderPath || normalizedFolderPath === "/") {
      return false;
    }

    const nestedFiles = Object.keys(state.workspaceFiles).filter(
      (filePath) =>
        filePath.startsWith(`${normalizedFolderPath}/`) || filePath === normalizedFolderPath,
    );

    const nestedProtected = nestedFiles.some((filePath) => isProtectedPath(filePath));
    if (nestedProtected) {
      return false;
    }

    const hasFolder =
      nestedFiles.length > 0 ||
      state.workspaceFolders.some(
        (folderPath) =>
          folderPath === normalizedFolderPath || folderPath.startsWith(`${normalizedFolderPath}/`),
      );

    if (!hasFolder) {
      return false;
    }

    set((currentState) => {
      if (!currentState.workspaceFiles) {
        return currentState;
      }

      const nextFiles = Object.fromEntries(
        Object.entries(currentState.workspaceFiles).filter(
          ([filePath]) =>
            !filePath.startsWith(`${normalizedFolderPath}/`) && filePath !== normalizedFolderPath,
        ),
      );

      const nextFolders = currentState.workspaceFolders.filter(
        (folderPath) =>
          folderPath !== normalizedFolderPath && !folderPath.startsWith(`${normalizedFolderPath}/`),
      );

      const nextOpenFiles = currentState.openFiles.filter(
        (filePath) =>
          !filePath.startsWith(`${normalizedFolderPath}/`) && filePath !== normalizedFolderPath,
      );
      const nextActiveFile =
        currentState.activeFile === normalizedFolderPath ||
        currentState.activeFile.startsWith(`${normalizedFolderPath}/`)
          ? pickFallbackActiveFile(nextFiles, nextOpenFiles)
          : currentState.activeFile;

      return {
        workspaceFiles: nextFiles,
        workspaceFolders: mergeFolders(nextFiles, nextFolders),
        openFiles: nextOpenFiles,
        activeFile: nextActiveFile,
      };
    });

    return true;
  },

  generatedFiles: null,
  setGeneratedFiles: (files) => {
    const sandpackFiles: SandpackFiles = {};
    Object.entries(files).forEach(([path, code]) => {
      sandpackFiles[path] = { code };
    });
    set({
      generatedFiles: sandpackFiles,
      workspaceFiles: sandpackFiles,
      workspaceFolders: inferFoldersFromFiles(sandpackFiles),
      openFiles: DEFAULT_OPEN_FILES,
      activeFile: DEFAULT_ACTIVE_FILE,
    });
  },
  clearGeneratedFiles: () =>
    set({
      generatedFiles: null,
      workspaceFiles: null,
      workspaceFolders: [],
      openFiles: DEFAULT_OPEN_FILES,
      activeFile: DEFAULT_ACTIVE_FILE,
    }),

  isAssembling: false,
  setIsAssembling: (isAssembling) => set({ isAssembling }),
}));
