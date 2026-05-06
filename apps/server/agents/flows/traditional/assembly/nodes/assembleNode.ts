import { T_Graph } from "../../../../shared/schemas/graphSchema.js";
import { scanDependencies, buildPackageJson } from "../../../../utils/dependencyBuilder.js";
import { normalizeSandpackFiles } from "../../../../utils/ast/fixer.js";
import { resolveFromAppRoot } from "../../../../../utils/runtimePaths.js";
import * as fs from "fs/promises";
import * as path from "path";

/**
 * Step 16: 文件组装节点
 *
 * 将所有生成的代码产物组装成 Sandpack 可渲染的 files 对象。
 * 这是一个纯 TypeScript 节点，不调用 LLM。
 */
export async function assembleNode(state: T_Graph) {
  console.log(`--- AssembleNode HEAD Start ---`);

  const files: Record<string, string> = state.existingFiles ? { ...state.existingFiles } : {};
  const categories: Record<string, number> = {};

  /**
   * 路径规范化函数
   * Sandpack 不使用 src/ 目录，需要移除 /src/ 前缀
   */
  const normalizePath = (filePath: string): string => {
    let normalized = filePath.startsWith("/") ? filePath : `/${filePath}`;
    // 移除 /src/ 前缀 (如 /src/pages/Home.tsx -> /pages/Home.tsx)
    if (normalized.startsWith("/src/")) {
      normalized = normalized.replace("/src/", "/");
    }
    return normalized;
  };

  // 辅助函数：添加文件并统计
  const addFile = (filePath: string, content: string, category: string) => {
    const normalizedPath = normalizePath(filePath);
    files[normalizedPath] = content;
    categories[category] = (categories[category] || 0) + 1;
  };

  // 辅助函数：添加数组文件
  const addFiles = (
    items: Array<{ path: string; content: string }> | undefined,
    category: string,
  ) => {
    if (!items) return;
    items.forEach((item) => addFile(item.path, item.content, category));
  };

  const ensureComponentBarrelFile = () => {
    if (files["/components/index.ts"]) {
      return;
    }

    const componentPaths = Object.keys(files)
      .filter((filePath) => {
        if (!filePath.startsWith("/components/")) return false;
        if (!filePath.endsWith(".tsx")) return false;
        return path.basename(filePath) !== "index.tsx";
      })
      .sort();

    if (componentPaths.length === 0) {
      return;
    }

    const exportLines = componentPaths.map((filePath) => {
      const componentName = path.basename(filePath, ".tsx");
      const relativePath = `.${filePath.slice("/components".length)}`;
      return `export { default as ${componentName} } from '${relativePath}';`;
    });

    addFile("/components/index.ts", `${exportLines.join("\n")}\n`, "components");
  };

  // ========================================
  // 1. 模板文件 (固定不变)
  // ========================================

  // 1.1 index.tsx - 从模板读取
  try {
    const indexPath = resolveFromAppRoot(import.meta.url, "templates/react-ts/index.tsx");
    const indexContent = await fs.readFile(indexPath, "utf-8");
    addFile("/index.tsx", indexContent, "entry");
  } catch (error) {
    console.warn("AssembleNode: Failed to read index.tsx template", error);
    // 降级：使用硬编码的默认内容
    addFile(
      "/index.tsx",
      `// @ts-nocheck
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const root = createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
      "entry",
    );
  }

  // 1.2 package.json - 先跳过，等所有文件收集完后再扫描 imports
  // （见步骤 3.5）

  // ========================================
  // 2. 单文件产物
  // ========================================

  // Step 8: 工具函数 (utils 返回 { files: [...] } 格式)
  if (state.utils?.files) {
    state.utils.files.forEach((file) => {
      if (file.path && file.code) {
        addFile(file.path, file.code, "utils");
      }
    });
  }

  // 兼容别名：部分模型会沿用 shadcn 常见习惯，误导入 ../utils/cn.ts。
  // 当项目实际生成了 /lib/utils.ts 时，额外提供一个轻量代理文件，
  // 避免 Sandpack 预览因路径差异直接报错。
  if (files["/lib/utils.ts"] && !files["/utils/cn.ts"]) {
    addFile(
      "/utils/cn.ts",
      `export { cn } from "../lib/utils.ts";
`,
      "utils",
    );
  }

  // Step 14: 全局样式
  if (state.styles?.path && state.styles?.content) {
    addFile(state.styles.path, state.styles.content, "styles");
  }

  // Step 15: App.tsx
  if (state.app?.path && state.app?.content) {
    addFile(state.app.path, state.app.content, "entry");
  }

  // ========================================
  // 3. 数组产物
  // ========================================

  // Step 7: 类型定义 (files 数组，字段是 code)
  if (state.types?.files) {
    state.types.files.forEach((file) => {
      addFile(file.path, file.code, "types");
    });
  }

  // Step 9: Mock 数据
  // 注意: mockData 实际结构是 { files: [...] }，不是数组
  if (state.mockData?.files) {
    state.mockData.files.forEach((file: { path: string; content: string }) => {
      addFile(file.path, file.content, "mockData");
    });
  }

  // Step 10: 服务层 (files 数组)
  if (state.service?.files) {
    state.service.files.forEach((file) => {
      addFile(file.path, file.content, "service");
    });
  }

  // Step 11: Hooks 层 (files 数组)
  if (state.hooks?.files) {
    state.hooks.files.forEach((file) => {
      addFile(file.path, file.content, "hooks");
    });
  }

  // Step 12: 组件代码
  console.log(`[AssembleNode] componentsCode count: ${state.componentsCode?.length || 0}`);
  if (state.componentsCode?.length) {
    console.log(
      `[AssembleNode] componentsCode paths:`,
      state.componentsCode.map((c) => c.path),
    );
  }
  addFiles(state.componentsCode, "components");
  ensureComponentBarrelFile();

  // Step 13: 页面代码
  console.log(`[AssembleNode] pagesCode count: ${state.pagesCode?.length || 0}`);
  if (state.pagesCode?.length) {
    console.log(
      `[AssembleNode] pagesCode paths:`,
      state.pagesCode.map((p) => p.path),
    );
  }
  addFiles(state.pagesCode, "pages");

  // Step 14: Layout 组件代码
  const layoutsCode = state.layouts?.layoutsCode || [];
  console.log(`[AssembleNode] layoutsCode count: ${layoutsCode.length}`);
  if (layoutsCode.length) {
    console.log(
      `[AssembleNode] layoutsCode paths:`,
      layoutsCode.map((l) => l.path),
    );
  }
  addFiles(layoutsCode, "layouts");

  // ========================================
  // 3.5 程序化依赖分析 + package.json
  // ========================================
  const normalizedFiles = normalizeSandpackFiles(files);

  // 所有代码文件已收集到 files 对象中，现在扫描 import 语句
  if (state.dependency?.packageJson) {
    const codeFiles = Object.entries(normalizedFiles)
      .filter(
        ([p]) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx"),
      )
      .map(([p, content]) => ({ path: p, code: content }));

    console.log(`[AssembleNode] Scanning imports from ${codeFiles.length} code files...`);

    const scannedDeps = scanDependencies(codeFiles);
    const scannedCount = Object.keys(scannedDeps).length;
    console.log(`[AssembleNode] Found ${scannedCount} third-party packages from imports`);

    const { packageJson: finalPkg, dependencies: addedDeps } = buildPackageJson(
      scannedDeps,
      state.dependency.packageJson,
    );

    const addedCount = Object.keys(addedDeps).length;
    if (addedCount > 0) {
      console.log(
        `[AssembleNode] Added ${addedCount} new dependencies:`,
        Object.keys(addedDeps).join(", "),
      );
    }

    normalizedFiles["/package.json"] = JSON.stringify(finalPkg, null, 2);
    categories["config"] = (categories["config"] || 0) + 1;
  }

  // ========================================
  // 4. 统计与日志
  // ========================================

  const totalFiles = Object.keys(normalizedFiles).length;

  console.log(`--- AssembleNode Complete ---`);
  console.log(`Total files: ${totalFiles}`);
  console.log(`Categories:`, JSON.stringify(categories, null, 2));
  console.log(`File paths:`, Object.keys(normalizedFiles).join(", "));

  return {
    files: {
      files: normalizedFiles,
      stats: {
        totalFiles,
        categories,
      },
    },
  };
}
