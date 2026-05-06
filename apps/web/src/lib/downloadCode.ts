// 代码下载工具函数
import JSZip from "jszip";
import type { SandpackFiles } from "@/types/store";

/**
 * 生成 index.html 文件内容
 */
function generateIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
    <!-- Tailwind CSS CDN (与 Sandpack 保持一致) -->
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/index.tsx"></script>
  </body>
</html>`;
}

/**
 * 生成 vite.config.ts 文件内容
 */
function generateViteConfig(): string {
  return `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
})
`;
}

/**
 * 生成 tsconfig.json 文件内容
 */
function generateTsConfig(): string {
  return `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,

    /* Bundler mode */
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",

    /* Linting */
    "strict": false,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
`;
}

/**
 * 生成 tsconfig.node.json 文件内容
 */
function generateTsConfigNode(): string {
  return `{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
`;
}

/**
 * 下载生成的代码为 zip 文件
 * @param generatedFiles - Sandpack 格式的生成文件
 * @param templateFiles - 模板文件（package.json, index.tsx, styles.css）
 */
export async function downloadGeneratedCode(
  generatedFiles: SandpackFiles,
  templateFiles: SandpackFiles,
): Promise<void> {
  const zip = new JSZip();

  // 1. 添加必需的配置文件（Sandpack 内置但下载时需要）
  zip.file("index.html", generateIndexHtml());
  zip.file("vite.config.ts", generateViteConfig());
  zip.file("tsconfig.json", generateTsConfig());
  zip.file("tsconfig.node.json", generateTsConfigNode());

  // 2. 添加模板文件（保持 Sandpack 的扁平结构）
  Object.entries(templateFiles).forEach(([path, file]) => {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    zip.file(cleanPath, file.code);
  });

  // 3. 添加生成的文件（保持 Sandpack 的扁平结构，包括子目录）
  Object.entries(generatedFiles).forEach(([path, file]) => {
    const cleanPath = path.startsWith("/") ? path.slice(1) : path;
    zip.file(cleanPath, file.code);
  });

  // 4. 生成 zip 文件
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: {
      level: 6, // 压缩级别 1-9，6 是平衡值
    },
  });

  // 5. 触发浏览器下载
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, -5); // 格式: 2026-02-05_14-42-35
  const filename = `figma-project-${timestamp}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  // 清理
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
