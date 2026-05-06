/**
 * Figma 直连流程 - 组装节点
 *
 * 职责：
 * 1. 接收 generatedFiles（各 Section 的组件代码）
 * 2. 接收 astParserResult（全局资源、辅助组件）
 * 3. 生成 App.tsx（引用所有 Section 组件）
 * 4. 生成 assets.ts（全局图片资源）
 * 5. 读取模板 index.tsx 和 package.json
 * 6. 输出 Sandpack 格式: Record<string, string>
 *
 * 流程位置: Assembly Step 1 / 1 (最终节点)
 * 上游: componentGenNode (generatedFiles)
 * 下游: END
 *
 * 确定性节点，无 AI 调用
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { scanDependencies, buildPackageJson } from "../../../../utils/dependencyBuilder.js";
import type { T_GeneratedFile } from "../../refactoring/schemas/refactoringSchema.js";
import type { AstParserOutput } from "../../parsing/schemas/parsingSchema.js";
import type { T_SectionNamingOutput } from "../../refactoring/schemas/refactoringSchema.js";

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const assemblyNode = async (state: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("📦 [FigmaAssemblyNode] 开始组装 Sandpack 文件");
  console.log("=".repeat(80));

  const generatedFiles: T_GeneratedFile[] = state.generatedFiles;
  const astResult: AstParserOutput = state.astParserResult;
  const namingResult: T_SectionNamingOutput = state.sectionNamingResult;

  // ========== 1. 校验输入 ==========
  if (!generatedFiles || generatedFiles.length === 0) {
    console.error("❌ [FigmaAssemblyNode] 错误: 缺少 generatedFiles");
    throw new Error("FigmaAssemblyNode: 缺少 generatedFiles，请确保 componentGenNode 已正确运行");
  }

  console.log(`📊 [FigmaAssemblyNode] 组件文件: ${generatedFiles.length} 个`);

  const files: Record<string, string> = {};
  const categories: Record<string, number> = {};

  // ========== 2. 读取模板文件 ==========
  const templateDir = path.resolve(__dirname, "../../../../../../templates/react-ts");

  // index.tsx (入口)
  try {
    const indexContent = fs.readFileSync(path.join(templateDir, "index.tsx"), "utf-8");
    files["/index.tsx"] = indexContent;
    categories["entry"] = 1;
  } catch (err) {
    console.warn("⚠️ [FigmaAssemblyNode] 无法读取模板 index.tsx，使用默认");
    files["/index.tsx"] = getDefaultIndexTsx();
    categories["entry"] = 1;
  }

  // package.json — 先读模板，稍后扫描 import 动态补充依赖
  let templatePackageJson: any = null;
  try {
    const pkgContent = fs.readFileSync(path.join(templateDir, "package.json"), "utf-8");
    templatePackageJson = JSON.parse(pkgContent);
  } catch (err) {
    console.warn("⚠️ [FigmaAssemblyNode] 无法读取模板 package.json");
  }

  // ========== 3. 生成 assets.ts（全局图片资源） ==========
  if (astResult?.globalAssets && astResult.globalAssets.length > 0) {
    const assetsCode = generateAssetsFile(astResult.globalAssets);
    files["/assets.ts"] = assetsCode;
    categories["assets"] = 1;
    console.log(`   📄 /assets.ts - ${astResult.globalAssets.length} 个图片资源`);
  }

  // ========== 4. 添加辅助组件 ==========
  if (astResult?.helperComponents && astResult.helperComponents.length > 0) {
    for (const helper of astResult.helperComponents) {
      const filePath = `/components/${helper.name}.tsx`;
      files[filePath] = wrapHelperComponent(
        helper.name,
        helper.rawCode,
        astResult.globalAssets || [],
      );
      categories["helpers"] = (categories["helpers"] || 0) + 1;
      console.log(`   📄 ${filePath} - 辅助组件`);
    }
  }

  // ========== 5. 添加生成的 Section 组件 ==========
  for (const file of generatedFiles) {
    const filePath = normalizeFilePath(file.filePath);
    files[filePath] = file.code;
    categories["components"] = (categories["components"] || 0) + 1;
    console.log(`   📄 ${filePath} - ${file.componentName}`);
  }

  // ========== 6. 生成 App.tsx ==========
  const appCode = generateAppTsx(generatedFiles, namingResult, astResult);
  files["/App.tsx"] = appCode;
  categories["app"] = 1;
  console.log(`   📄 /App.tsx - 主入口`);

  // ========== 7. 生成全局样式 ==========
  files["/styles.css"] = getGlobalStyles();
  categories["styles"] = 1;

  // ========== 8. 验证和修复图片引用 ==========
  console.log("\n🔧 [FigmaAssemblyNode] 验证图片引用...");

  // 获取 assets.ts 中定义的所有变量名
  const assetsCode = files["/assets.ts"] || "";
  const definedAssets = extractDefinedAssets(assetsCode);
  console.log(`   📋 assets.ts 定义了 ${definedAssets.size} 个变量`);

  // 扫描所有组件文件，修复未定义的图片引用
  let totalFixedRefs = 0;
  for (const [filePath, code] of Object.entries(files)) {
    if (filePath.startsWith("/components/") && filePath.endsWith(".tsx")) {
      const { fixedCode, fixedCount } = fixUndefinedImageRefs(code, definedAssets, filePath);
      if (fixedCount > 0) {
        files[filePath] = fixedCode;
        totalFixedRefs += fixedCount;
      }
    }
  }

  if (totalFixedRefs > 0) {
    console.log(`   ✅ 共修复 ${totalFixedRefs} 处图片引用`);
  } else {
    console.log(`   ✅ 所有图片引用正常`);
  }

  // ========== 9. 后处理：清理 Figma 残留伪影 ==========
  console.log("\n🧹 [FigmaAssemblyNode] 清理 Figma 残留...");
  let totalCleaned = 0;
  for (const [filePath, code] of Object.entries(files)) {
    if (filePath.startsWith("/components/") && filePath.endsWith(".tsx")) {
      const cleaned = sanitizeFigmaArtifacts(code);
      if (cleaned !== code) {
        files[filePath] = cleaned;
        totalCleaned++;
        console.log(`   🧹 清理了 ${filePath}`);
      }
    }
  }
  if (totalCleaned > 0) {
    console.log(`   ✅ 共清理 ${totalCleaned} 个组件文件`);
  } else {
    console.log(`   ✅ 无需清理`);
  }

  // ========== 9.5 程序化依赖分析 + package.json ==========
  if (templatePackageJson) {
    const codeFiles = Object.entries(files)
      .filter(
        ([p]) => p.endsWith(".ts") || p.endsWith(".tsx") || p.endsWith(".js") || p.endsWith(".jsx"),
      )
      .map(([p, content]) => ({ path: p, code: content }));

    console.log(`   📦 扫描 ${codeFiles.length} 个代码文件的 import 语句...`);

    const scannedDeps = scanDependencies(codeFiles);
    const { packageJson: finalPkg, dependencies: addedDeps } = buildPackageJson(
      scannedDeps,
      templatePackageJson,
    );

    const addedCount = Object.keys(addedDeps).length;
    if (addedCount > 0) {
      console.log(`   📦 新增 ${addedCount} 个依赖:`, Object.keys(addedDeps).join(", "));
    }

    files["/package.json"] = JSON.stringify(finalPkg, null, 2);
    categories["config"] = 1;
  }

  // ========== 10. 统计信息 ==========
  const totalFiles = Object.keys(files).length;

  console.log("\n✅ [FigmaAssemblyNode] 组装完成");
  console.log(`   📊 最终输出:`);
  console.log(`      - 总文件数: ${totalFiles}`);
  Object.entries(categories).forEach(([cat, count]) => {
    console.log(`      - ${cat}: ${count}`);
  });
  console.log("");

  return {
    files: {
      files,
      stats: { totalFiles, categories },
    },
  };
};

// ==================== 代码生成工具函数 ====================

/**
 * 生成 assets.ts 文件
 */
function generateAssetsFile(assets: Array<{ variableName: string; url: string }>): string {
  const exports = assets.map((a) => `export const ${a.variableName} = "${a.url}";`).join("\n");

  return `/**
 * 图片资源（来自 Figma 设计稿）
 * 自动生成，请勿手动修改
 */

${exports}
`;
}

/**
 * 包装辅助组件（添加 export + 注入缺失的 asset import）
 */
function wrapHelperComponent(
  name: string,
  rawCode: string,
  globalAssets: Array<{ variableName: string; url: string }>,
): string {
  // 检测代码中引用了哪些 imgXxx 变量但未 import
  const usedAssetVars = globalAssets
    .filter((a) => {
      const regex = new RegExp(`\\b${a.variableName}\\b`);
      return regex.test(rawCode);
    })
    .map((a) => a.variableName);

  let result = rawCode;

  // 如果有引用但没有 import，注入 import 语句
  if (usedAssetVars.length > 0 && !rawCode.includes('from "../assets"')) {
    const importLine = `import { ${usedAssetVars.join(", ")} } from "../assets";\n\n`;
    result = importLine + result;
  }

  // 添加 export（如果缺失）
  // 同时提供 named export 和 default export，兼容 AI 可能生成的任意 import 风格
  // 例如 `import X from "./X"` 和 `import { X } from "./X"` 都能正确工作
  const hasDefaultExport = result.includes("export default");
  const hasNamedExport =
    result.includes(`export function ${name}`) ||
    result.includes(`export { ${name}`) ||
    result.includes(`export const ${name}`);

  if (!hasDefaultExport && !hasNamedExport) {
    // 两种都没有：添加 named export + default export
    result = `${result}\n\nexport { ${name} };\nexport default ${name};\n`;
  } else if (hasDefaultExport && !hasNamedExport) {
    // 只有 default export：补充 named export
    result = `${result}\nexport { ${name} };\n`;
  } else if (!hasDefaultExport && hasNamedExport) {
    // 只有 named export：补充 default export
    result = `${result}\nexport default ${name};\n`;
  }
  // 两种都有：无需处理

  return result;
}

/**
 * 生成 App.tsx 主入口
 */
function generateAppTsx(
  generatedFiles: T_GeneratedFile[],
  _namingResult: T_SectionNamingOutput | null,
  _astResult: AstParserOutput | null,
): string {
  // 去重：按 componentName 去重（保留首次出现的）
  const seen = new Set<string>();
  const uniqueFiles = generatedFiles.filter((f) => {
    if (seen.has(f.componentName)) {
      console.warn(`⚠️ [AppTsx] 跳过重复组件 import: ${f.componentName}`);
      return false;
    }
    seen.add(f.componentName);
    return true;
  });

  // Import 语句（已去重）
  const imports = uniqueFiles
    .map((f) => {
      const importPath = f.filePath.replace(/\.tsx$/, "").replace(/^components\//, "./components/");
      const normalizedPath = importPath.startsWith("./") ? importPath : `./${importPath}`;
      return `import ${f.componentName} from "${normalizedPath}";`;
    })
    .join("\n");

  // 组件使用（路线 A: 组件内部自己 import 资源，App 不传 props）
  // 使用 uniqueFiles 而非 generatedFiles 避免重复渲染
  const componentUsages = uniqueFiles.map((f) => `        <${f.componentName} />`).join("\n");

  // App.tsx 使用正常文档流布局，子组件垂直堆叠
  // - <main> 语义化标签
  // - flex flex-col: 子组件使用正常文档流垂直排列
  // - 不使用 overflow-hidden（会阻止滚动）
  return `${imports}

export default function App() {
  return (
    <main className="w-full min-h-screen">
${componentUsages}
    </main>
  );
}
`;
}

/**
 * 标准化文件路径
 * 确保以 / 开头，去除 /src/ 前缀
 */
function normalizeFilePath(filePath: string): string {
  let normalized = filePath.replace(/^\/src\//, "/");
  if (!normalized.startsWith("/")) {
    normalized = "/" + normalized;
  }
  return normalized;
}

/**
 * 默认的 index.tsx
 */
function getDefaultIndexTsx(): string {
  return `// @ts-nocheck
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", color: "red" }}>
          <h2>渲染出错</h2>
          <pre>{this.state.error?.message}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
`;
}

/**
 * 全局样式
 */
function getGlobalStyles(): string {
  return `@tailwind base;
@tailwind components;
@tailwind utilities;

/* === Global Reset & Defaults === */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  min-height: 100vh;
  overflow-x: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  background-color: #ffffff;
}

#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* === Typography === */
h1, h2, h3, h4, h5, h6 {
  line-height: 1.3;
  font-weight: 600;
}

p {
  line-height: 1.7;
}

/* === Image Defaults === */
img {
  max-width: 100%;
  height: auto;
  display: block;
}

/* === Interactive Elements === */
button {
  cursor: pointer;
  border: none;
  background: none;
  font: inherit;
}

a {
  text-decoration: none;
  color: inherit;
}

/* === Section Spacing === */
section {
  width: 100%;
}
`;
}

/**
 * 清理生成代码中残留的 Figma 伪影
 * - 移除 data-node-id / data-name 属性
 * - 修复 Figma 格式的字体声明
 * - 将小数像素值四舍五入
 * - 移除画布级超大尺寸（w-[1920px] 等）
 */
function sanitizeFigmaArtifacts(code: string): string {
  let result = code;

  // 1. 移除 data-node-id="xxx" 和 data-name="xxx" 属性
  result = result.replace(/\s+data-node-id="[^"]*"/g, "");
  result = result.replace(/\s+data-name="[^"]*"/g, "");

  // 2. 修复 Figma 字体格式: font-['MiSans:Medium',sans-serif] → font-sans font-medium
  const fontMap: Record<string, string> = {
    Regular: "font-sans font-normal",
    Medium: "font-sans font-medium",
    Semibold: "font-sans font-semibold",
    Bold: "font-sans font-bold",
    Light: "font-sans font-light",
    Thin: "font-sans font-thin",
    ExtraBold: "font-sans font-extrabold",
    Black: "font-sans font-black",
  };
  result = result.replace(
    /font-\['[^']*?:(\w+)'[^\]]*\]/g,
    (_match, weight: string) => fontMap[weight] || "font-sans",
  );

  // 3. 四舍五入小数像素值: h-[55.645px] → h-[56px]
  result = result.replace(/(\w)-\[(\d+\.\d+)px\]/g, (_match, prefix: string, value: string) => {
    const rounded = Math.round(parseFloat(value));
    return `${prefix}-[${rounded}px]`;
  });

  // 4. 替换画布级超大固定尺寸
  result = result.replace(/w-\[1920px\]/g, "w-full");
  result = result.replace(/w-\[1440px\]/g, "w-full");
  result = result.replace(/h-\[1920px\]/g, "h-auto");
  result = result.replace(/h-\[1440px\]/g, "h-auto");
  result = result.replace(/h-\[1080px\]/g, "h-auto");
  result = result.replace(/min-h-\[1920px\]/g, "min-h-screen");
  result = result.replace(/min-h-\[1440px\]/g, "min-h-screen");
  result = result.replace(/min-h-\[1080px\]/g, "min-h-screen");

  // 5. 清理 maskSize 中的画布尺寸
  result = result.replace(/maskSize:\s*["']1920px\s+\d+px["']/g, 'maskSize: "cover"');

  // 6. 为缺少 object-fit 的 <img> 标签自动添加 object-contain
  // 匹配 <img ... className="..." 中没有 object-contain/object-cover 的情况
  result = result.replace(
    /(<img\b[^>]*className=")([^"]*)("[^>]*\/>)/g,
    (_match, before: string, classes: string, after: string) => {
      if (
        classes.includes("object-contain") ||
        classes.includes("object-cover") ||
        classes.includes("object-fill") ||
        classes.includes("object-none")
      ) {
        return _match; // 已有 object-fit，跳过
      }
      return `${before}${classes} object-contain${after}`;
    },
  );

  return result;
}

/**
 * 从 assets.ts 代码中提取所有定义的变量名
 */
function extractDefinedAssets(assetsCode: string): Set<string> {
  const defined = new Set<string>();
  // 匹配 export const imgXxx = "..."
  const regex = /export\s+const\s+(img\w+)\s*=/g;
  let match;
  while ((match = regex.exec(assetsCode)) !== null) {
    defined.add(match[1]);
  }
  return defined;
}

/**
 * 修复组件代码中未定义的图片引用
 *
 * 智能匹配规则：
 * - img11 → imgImage11 (数字前缀)
 * - img + X → imgImage + X (通用转换)
 */
function fixUndefinedImageRefs(
  code: string,
  definedAssets: Set<string>,
  filePath: string,
): { fixedCode: string; fixedCount: number } {
  let fixedCode = code;
  let fixedCount = 0;

  // 查找代码中所有 img 开头的变量引用
  const usedVarRegex = /\b(img[A-Za-z0-9]+)\b/g;
  const usedVars = new Set<string>();
  let match;
  while ((match = usedVarRegex.exec(code)) !== null) {
    usedVars.add(match[1]);
  }

  // 检查每个使用的变量是否已定义
  for (const varName of usedVars) {
    if (!definedAssets.has(varName)) {
      // 尝试智能匹配
      const candidate = findMatchingAsset(varName, definedAssets);
      if (candidate) {
        // 替换所有引用，但排除对象 key 位置（varName: 这种模式）
        // 使用负向前瞻排除后面紧跟冒号的情况（对象 key）
        const varRegex = new RegExp(`\\b${varName}\\b(?!\\s*:)`, "g");
        fixedCode = fixedCode.replace(varRegex, candidate);
        fixedCount++;
        console.log(`   🔧 ${filePath}: ${varName} → ${candidate}`);
      } else {
        // 方案 C 兜底：无法匹配的图片引用替换为占位图，避免运行时崩溃
        // 同样排除对象 key 位置
        console.warn(`   🛡️ ${filePath}: ${varName} 无匹配项，替换为占位图`);
        const varRegex = new RegExp(`\\b${varName}\\b(?!\\s*:)`, "g");
        // SVG 占位图：添加 viewBox + preserveAspectRatio 防止拉伸
        const placeholder = `"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200' preserveAspectRatio='xMidYMid meet' width='200' height='200'%3E%3Crect width='200' height='200' rx='8' fill='%23f0f0f0'/%3E%3Ctext x='50%25' y='50%25' font-size='12' font-family='sans-serif' text-anchor='middle' dy='.3em' fill='%23bbb'%3E${varName}%3C/text%3E%3C/svg%3E"`;
        fixedCode = fixedCode.replace(varRegex, placeholder);
        fixedCount++;
      }
    }
  }

  // 如果有修复，更新 import 语句并清理无效 import
  if (fixedCount > 0) {
    fixedCode = updateAssetImports(fixedCode, definedAssets);
    // 清理已替换为占位图的变量的 import（它们现在是内联字符串，不需要 import）
    fixedCode = removeOrphanedImports(fixedCode);
  }

  return { fixedCode, fixedCount };
}

/**
 * 尝试为未定义的变量名找到匹配的 asset
 *
 * 匹配策略：
 * 1. img11 → imgImage11 (数字前缀，添加 Image)
 * 2. imgFoo → imgImageFoo (非数字前缀，添加 Image)
 * 3. 模糊匹配：检查 assets 中是否有以该后缀结尾的变量
 */
function findMatchingAsset(varName: string, definedAssets: Set<string>): string | null {
  // 提取 img 后面的部分
  const suffix = varName.replace(/^img/, "");

  // 策略1: 直接尝试 imgImage + suffix
  const candidate1 = `imgImage${suffix}`;
  if (definedAssets.has(candidate1)) {
    return candidate1;
  }

  // 策略2: 如果 suffix 是数字，尝试 imgImage + 数字
  if (/^\d+$/.test(suffix)) {
    const candidate2 = `imgImage${suffix}`;
    if (definedAssets.has(candidate2)) {
      return candidate2;
    }
  }

  // 策略3: 模糊匹配 - 找到以相同数字后缀结尾的 asset
  const numericSuffix = suffix.match(/\d+$/)?.[0];
  if (numericSuffix) {
    for (const asset of definedAssets) {
      if (asset.endsWith(numericSuffix)) {
        return asset;
      }
    }
  }

  // 策略4: 不区分大小写匹配
  const lowerVarName = varName.toLowerCase();
  for (const asset of definedAssets) {
    if (asset.toLowerCase() === lowerVarName) {
      return asset;
    }
  }

  return null;
}

/**
 * 更新组件的 asset import 语句
 * 确保 import 的变量都是 assets.ts 中定义的
 */
function updateAssetImports(code: string, definedAssets: Set<string>): string {
  // 查找现有的 assets import 语句
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']\.\.\/assets["'];?/;
  const importMatch = code.match(importRegex);

  if (importMatch) {
    // 解析现有 import 的变量
    const importedVars = importMatch[1]
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    // 过滤掉未定义的变量，只保留定义过的
    const validVars = importedVars.filter((v) => definedAssets.has(v));

    // 查找代码中实际使用的 asset 变量
    const usedVars = new Set<string>();
    for (const asset of definedAssets) {
      const regex = new RegExp(`\\b${asset}\\b`);
      if (regex.test(code)) {
        usedVars.add(asset);
      }
    }

    // 合并：保留有效的 import + 添加新使用的
    const finalVars = [...new Set([...validVars, ...usedVars])].sort();

    if (finalVars.length > 0) {
      const newImport = `import { ${finalVars.join(", ")} } from "../assets";`;
      return code.replace(importRegex, newImport);
    }
  }

  return code;
}

/**
 * 清理孤立的 import
 * 当变量被替换为占位图后，原来的 import 变成了无效引用
 */
function removeOrphanedImports(code: string): string {
  const importRegex = /import\s*\{([^}]+)\}\s*from\s*["']\.\.\/assets["'];?\n?/g;

  return code.replace(importRegex, (fullMatch, vars) => {
    const importedVars = vars
      .split(",")
      .map((v: string) => v.trim())
      .filter(Boolean);

    // 检查每个 import 的变量是否仍在代码的非 import 部分被使用
    const codeWithoutImports = code.replace(/import\s*\{[^}]+\}\s*from\s*["'][^"']+["'];?\n?/g, "");
    const stillUsed = importedVars.filter((v: string) => {
      const regex = new RegExp(`\\b${v}\\b`);
      return regex.test(codeWithoutImports);
    });

    if (stillUsed.length === 0) {
      // 所有变量都不再使用，移除整个 import 语句
      return "";
    }

    if (stillUsed.length < importedVars.length) {
      // 部分变量不再使用，更新 import
      return `import { ${stillUsed.join(", ")} } from "../assets";\n`;
    }

    // 所有变量仍在使用
    return fullMatch;
  });
}
