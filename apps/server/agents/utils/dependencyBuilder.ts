/**
 * 程序化依赖构建器
 *
 * 通过扫描生成代码中的 import 语句，自动推断第三方依赖。
 * 不依赖 LLM，100% 确定性，避免版本号为 null 等异常问题。
 *
 * 流程：
 *   1. 遍历所有已生成的代码文件
 *   2. 提取 import/require 语句中的第三方包名
 *   3. 从版本映射表查找版本号（未命中则 "latest"）
 *   4. 与模板 package.json 合并
 *   5. 输出最终 package.json
 */

import * as fs from "fs/promises";
import * as path from "path";
import { resolveFromAppRoot } from "../../utils/runtimePaths.js";

// ===================== 版本映射表 =====================

/**
 * 常用 NPM 包版本映射表
 *
 * 覆盖 LLM 生成代码中最常引入的第三方包。
 * 维护原则：
 * - 只收录 LLM 常用的包（不需要穷举 npm）
 * - 版本号使用稳定的大版本范围
 * - 定期更新（每季度检查一次）
 */
const VERSION_MAP: Record<string, string> = {
  // ===== React 生态 =====
  react: "^18.3.1",
  "react-dom": "^18.3.1",
  "react-router-dom": "^6.28.0",
  "react-hook-form": "^7.55.0",

  // ===== 状态管理 =====
  zustand: "^4.5.0",
  jotai: "^2.6.0",
  "@reduxjs/toolkit": "^2.0.0",
  "react-redux": "^9.1.0",
  recoil: "^0.7.0",

  // ===== UI 组件库 =====
  "lucide-react": "^0.487.0",
  "react-icons": "^5.3.0",
  "@heroicons/react": "^2.1.0",
  "@radix-ui/react-accordion": "^1.2.0",
  "@radix-ui/react-alert-dialog": "^1.1.0",
  "@radix-ui/react-avatar": "^1.1.0",
  "@radix-ui/react-checkbox": "^1.1.0",
  "@radix-ui/react-collapsible": "^1.1.0",
  "@radix-ui/react-dialog": "^1.1.0",
  "@radix-ui/react-dropdown-menu": "^2.1.0",
  "@radix-ui/react-hover-card": "^1.1.0",
  "@radix-ui/react-label": "^2.1.0",
  "@radix-ui/react-menubar": "^1.1.0",
  "@radix-ui/react-navigation-menu": "^1.2.0",
  "@radix-ui/react-popover": "^1.1.0",
  "@radix-ui/react-progress": "^1.1.0",
  "@radix-ui/react-radio-group": "^1.2.0",
  "@radix-ui/react-scroll-area": "^1.2.0",
  "@radix-ui/react-select": "^2.1.0",
  "@radix-ui/react-separator": "^1.1.0",
  "@radix-ui/react-slider": "^1.2.0",
  "@radix-ui/react-slot": "^1.1.0",
  "@radix-ui/react-switch": "^1.1.0",
  "@radix-ui/react-tabs": "^1.1.0",
  "@radix-ui/react-toast": "^1.2.0",
  "@radix-ui/react-toggle": "^1.1.0",
  "@radix-ui/react-toggle-group": "^1.1.0",
  "@radix-ui/react-tooltip": "^1.1.0",
  "class-variance-authority": "^0.7.1",
  clsx: "^2.1.1",
  "tailwind-merge": "^2.5.4",
  "tailwindcss-animate": "^1.0.7",
  cmdk: "^1.0.0",

  // ===== 图表 =====
  recharts: "^2.15.2",
  "chart.js": "^4.4.0",
  "react-chartjs-2": "^5.2.0",
  d3: "^7.9.0",
  nivo: "^0.87.0",

  // ===== 日期/时间 =====
  "date-fns": "^3.6.0",
  dayjs: "^1.11.0",
  "react-day-picker": "^8.10.1",
  moment: "^2.30.0",

  // ===== 动画 =====
  "framer-motion": "^11.0.0",
  "react-spring": "^9.7.0",
  "react-transition-group": "^4.4.0",
  "auto-animate": "^0.8.0",
  "@formkit/auto-animate": "^0.8.0",

  // ===== 表单/验证 =====
  zod: "^3.23.0",
  yup: "^1.4.0",
  "@hookform/resolvers": "^3.9.0",

  // ===== 网络请求 =====
  axios: "^1.7.0",
  swr: "^2.2.0",
  "@tanstack/react-query": "^5.50.0",
  ky: "^1.4.0",

  // ===== 富文本/Markdown =====
  "react-markdown": "^9.0.0",
  "react-quill": "^2.0.0",
  "remark-gfm": "^4.0.0",
  "@tiptap/react": "^2.6.0",
  "react-syntax-highlighter": "^15.5.0",
  "highlight.js": "^11.10.0",
  prismjs: "^1.29.0",

  // ===== 表格/虚拟列表 =====
  "@tanstack/react-table": "^8.20.0",
  "react-virtualized": "^9.22.0",
  "react-virtuoso": "^4.7.0",
  "@tanstack/react-virtual": "^3.8.0",

  // ===== 拖拽 =====
  "@dnd-kit/core": "^6.1.0",
  "@dnd-kit/sortable": "^8.0.0",
  "react-beautiful-dnd": "^13.1.0",
  "react-dnd": "^16.0.0",

  // ===== 轮播/滑动 =====
  "embla-carousel-react": "^8.6.0",
  swiper: "^11.1.0",

  // ===== 弹窗/通知 =====
  sonner: "^2.0.3",
  "react-hot-toast": "^2.4.0",
  "react-toastify": "^10.0.0",
  sweetalert2: "^11.12.0",

  // ===== 其他常用 =====
  "input-otp": "^1.4.2",
  "next-themes": "^0.4.6",
  "react-resizable-panels": "^2.1.7",
  uuid: "^9.0.0",
  nanoid: "^5.0.0",
  lodash: "^4.17.0",
  "lodash-es": "^4.17.0",
  immer: "^10.1.0",
  "react-helmet-async": "^2.0.0",
  "react-intersection-observer": "^9.10.0",
  "react-use": "^17.5.0",
  "usehooks-ts": "^3.1.0",
  "@headlessui/react": "^2.1.0",
  "react-dropzone": "^14.2.0",
  "react-i18next": "^14.1.0",
  i18next: "^23.11.0",
  "react-error-boundary": "^4.0.0",
};

// ===================== Import 扫描 =====================

/**
 * 从代码中提取所有第三方包名
 *
 * 处理的 import 格式：
 * - import xxx from 'package'
 * - import { xxx } from 'package'
 * - import 'package'
 * - const xxx = require('package')
 * - import('package')
 */
export function extractImports(code: string): Set<string> {
  const packages = new Set<string>();

  // 匹配 ES import 语句
  const importRegex =
    /(?:import\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const modulePath = match[1] || match[2];
    if (modulePath) {
      const pkgName = extractPackageName(modulePath);
      if (pkgName) packages.add(pkgName);
    }
  }

  // 匹配 require 语句
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(code)) !== null) {
    const modulePath = match[1];
    if (modulePath) {
      const pkgName = extractPackageName(modulePath);
      if (pkgName) packages.add(pkgName);
    }
  }

  return packages;
}

/**
 * 从 import 路径中提取包名
 *
 * 规则：
 * - 相对路径（./ ../ @/）→ 返回 null
 * - @scope/package/sub → @scope/package
 * - package/sub → package
 */
function extractPackageName(modulePath: string): string | null {
  // 排除相对路径
  if (
    modulePath.startsWith("./") ||
    modulePath.startsWith("../") ||
    modulePath.startsWith("@/") ||
    modulePath.startsWith("~/")
  ) {
    return null;
  }

  // 排除 Node.js 内置模块
  const builtins = new Set([
    "fs",
    "path",
    "os",
    "url",
    "util",
    "http",
    "https",
    "stream",
    "crypto",
    "events",
    "buffer",
    "process",
    "child_process",
    "cluster",
    "net",
    "dns",
    "tls",
  ]);

  // scoped 包: @scope/package
  if (modulePath.startsWith("@")) {
    const parts = modulePath.split("/");
    if (parts.length >= 2) {
      return `${parts[0]}/${parts[1]}`;
    }
    return null;
  }

  // 普通包: package/sub → package
  const parts = modulePath.split("/");
  const pkgName = parts[0];

  if (builtins.has(pkgName)) return null;

  return pkgName;
}

// ===================== 依赖构建 =====================

/**
 * 扫描所有文件，提取第三方依赖
 */
export function scanDependencies(
  files: Array<{ path: string; code?: string; content?: string }>,
): Record<string, string> {
  const allPackages = new Set<string>();

  for (const file of files) {
    const code = file.code || file.content || "";
    if (!code) continue;

    const packages = extractImports(code);
    packages.forEach((pkg) => allPackages.add(pkg));
  }

  // 查找版本号
  const deps: Record<string, string> = {};
  for (const pkg of allPackages) {
    deps[pkg] = VERSION_MAP[pkg] || "latest";
    if (!VERSION_MAP[pkg]) {
      console.log(`[DependencyBuilder] Unknown package "${pkg}" → using "latest"`);
    }
  }

  return deps;
}

/**
 * 构建完整的 package.json
 *
 * @param scannedDeps - 从代码中扫描出的依赖
 * @param templatePackageJson - 模板 package.json 对象
 * @returns 合并后的 package.json 对象
 */
export function buildPackageJson(
  scannedDeps: Record<string, string>,
  templatePackageJson: any,
): any {
  const templateDeps = templatePackageJson.dependencies || {};

  // 合并策略：模板版本优先（防止降级核心库）
  const mergedDependencies = { ...templateDeps };
  const addedDeps: Record<string, string> = {};

  for (const [pkg, version] of Object.entries(scannedDeps)) {
    if (!mergedDependencies[pkg]) {
      mergedDependencies[pkg] = version;
      addedDeps[pkg] = version;
      console.log(`[DependencyBuilder] Adding: ${pkg}@${version}`);
    }
  }

  return {
    packageJson: {
      ...templatePackageJson,
      dependencies: mergedDependencies,
    },
    dependencies: addedDeps,
    reason: "基于代码 import 语句自动分析，程序化推断依赖",
  };
}

/**
 * 读取模板 package.json
 */
export async function readTemplatePackageJson(): Promise<any> {
  const templatePath = resolveFromAppRoot(import.meta.url, "templates/react-ts/package.json");

  try {
    const content = await fs.readFile(templatePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    console.error(`[DependencyBuilder] Failed to read template: ${templatePath}`, error);
    // 降级：返回最小化模板
    return {
      name: "react-project",
      private: true,
      version: "0.0.0",
      type: "module",
      scripts: {
        dev: "vite",
        build: "vite build",
      },
      dependencies: {
        react: "^18.3.1",
        "react-dom": "^18.3.1",
      },
      devDependencies: {
        "@vitejs/plugin-react-swc": "^3.10.2",
        tailwindcss: "^3.4.17",
        vite: "6.3.5",
      },
    };
  }
}
