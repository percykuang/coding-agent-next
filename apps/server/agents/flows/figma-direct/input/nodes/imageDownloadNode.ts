/**
 * 图片下载与 OSS 上传节点
 *
 * 职责：
 * 1. 从 rawCode 中提取 assets.ts 里的所有图片 URL
 * 2. 并行下载所有图片到内存
 * 3. 并行上传到 ALI OSS
 * 4. 替换 rawCode 中的图片 URL 为 OSS 永久链接
 *
 * 流程位置: 插入在 figmaInputNode 与 astParserNode 之间
 * 上游: figmaInputNode (接收 rawCode)
 * 下游: astParserNode (传递替换后的 rawCode)
 */

import { batchUploadImagesToOSS } from "../../../../../utils/oss.js";

/**
 * 规范化图片变量名
 *
 * Figma MCP 生成的变量名可能是 `imgImage11` 这种冗余格式，
 * 但组件代码中可能引用为 `img11`。
 *
 * 规范化规则：
 * - imgImage + 数字 → img + 数字 (如 imgImage11 → img11)
 * - imgImageXxx → imgXxx (如 imgImageFoo → imgFoo)
 *
 * @param varName 原始变量名
 * @returns 规范化后的变量名
 */
function normalizeAssetVarName(varName: string): string {
  // 匹配 imgImage + 后续内容
  const match = varName.match(/^imgImage(.+)$/i);
  if (match) {
    const suffix = match[1];
    // 首字母小写，保持驼峰命名
    const normalizedSuffix = suffix.charAt(0).toLowerCase() + suffix.slice(1);
    return `img${normalizedSuffix}`;
  }
  return varName;
}

/**
 * 从 assets.ts 内容中提取所有图片 URL
 *
 * 匹配模式：
 * - export const imgXxx = "http://...";
 * - const imgXxx = "http://...";
 */
function extractImageUrls(assetsContent: string): Array<{
  varName: string;
  url: string;
  fullMatch: string;
}> {
  const results: Array<{ varName: string; url: string; fullMatch: string }> = [];

  // 匹配 (export)? const imgXxx = "url" 或 'url'
  // export 关键字可选，支持 Figma MCP 返回的两种格式
  const regex = /(?:export\s+)?const\s+(img\w+)\s*=\s*["']([^"']+)["']\s*;?/g;
  let match;

  while ((match = regex.exec(assetsContent)) !== null) {
    const [fullMatch, varName, url] = match;
    // 只处理 http/https 链接
    if (url.startsWith("http://") || url.startsWith("https://")) {
      results.push({ varName, url, fullMatch });
    }
  }

  return results;
}

/**
 * 下载单张图片
 */
async function downloadImage(url: string): Promise<{
  buffer: Buffer;
  contentType: string;
} | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`⚠️ 图片下载失败 (${response.status}): ${url}`);
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    return { buffer, contentType };
  } catch (error) {
    console.warn(`⚠️ 图片下载异常: ${url}`, error);
    return null;
  }
}

/**
 * 从 rawCode 中定位 assets.ts 的内容
 *
 * rawCode 可能是以下格式之一：
 * 1. 单个大字符串，包含多个文件的代码（用特殊分隔符或注释分隔）
 * 2. 格式化的字符串，每个文件以 `// === filename ===` 开头
 *
 * 这里采用正则匹配找到 assets.ts 对应的代码块
 */
function _extractAssetsContent(rawCode: string): {
  assetsContent: string;
  startIndex: number;
  endIndex: number;
} | null {
  // 尝试匹配 assets.ts 文件块
  // 常见格式：`// === assets.ts ===` 或 `// --- assets.ts ---` 或 `/* assets.ts */`

  // 模式1: 查找 // === assets.ts === 风格的分隔符
  const separatorPatterns = [
    /\/\/\s*===+\s*assets\.ts\s*===+\s*\n([\s\S]*?)(?=\/\/\s*===+\s*\w+\.\w+\s*===+|$)/i,
    /\/\/\s*---+\s*assets\.ts\s*---+\s*\n([\s\S]*?)(?=\/\/\s*---+\s*\w+\.\w+\s*---+|$)/i,
    /\/\*\s*assets\.ts\s*\*\/\s*\n([\s\S]*?)(?=\/\*\s*\w+\.\w+\s*\*\/|$)/i,
  ];

  for (const pattern of separatorPatterns) {
    const match = rawCode.match(pattern);
    if (match) {
      const startIndex = rawCode.indexOf(match[0]);
      return {
        assetsContent: match[1].trim(),
        startIndex,
        endIndex: startIndex + match[0].length,
      };
    }
  }

  // 模式2: 如果没有分隔符，尝试直接在整个 rawCode 中查找 assets.ts 的特征
  // 特征：包含多个 `export const img` 开头的导出
  const imgExportPattern = /export\s+const\s+img\w+\s*=\s*["'][^"']+["']\s*;?/g;
  const imgExports = rawCode.match(imgExportPattern);

  if (imgExports && imgExports.length >= 1) {
    // 找到第一个和最后一个 imgExport 的位置，提取这个范围
    const firstExport = imgExports[0];
    const lastExport = imgExports[imgExports.length - 1];
    const startIndex = rawCode.indexOf(firstExport);
    const endIndex = rawCode.lastIndexOf(lastExport) + lastExport.length;

    // 向前扩展，包含可能的注释头
    let extendedStart = startIndex;
    const beforeContent = rawCode.substring(0, startIndex);
    const commentMatch = beforeContent.match(/\/\*\*[\s\S]*?\*\/\s*$/);
    if (commentMatch) {
      extendedStart = startIndex - commentMatch[0].length;
    }

    return {
      assetsContent: rawCode.substring(extendedStart, endIndex),
      startIndex: extendedStart,
      endIndex,
    };
  }

  return null;
}

export const imageDownloadNode = async (state: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("🖼️  [ImageDownloadNode] 开始处理图片资源");
  console.log("=".repeat(80));

  // 调试：打印 state 的所有 key
  console.log("🔍 [ImageDownloadNode] state keys:", Object.keys(state));

  const rawCode = state.rawCode;

  // 调试：打印 rawCode 的类型和长度
  console.log("🔍 [ImageDownloadNode] rawCode type:", typeof rawCode);
  console.log("🔍 [ImageDownloadNode] rawCode length:", rawCode?.length || 0);

  if (!rawCode) {
    console.log("⚠️ [ImageDownloadNode] rawCode 为空，跳过图片处理");
    return {};
  }

  // 调试：打印 rawCode 的前 1000 个字符
  console.log("🔍 [ImageDownloadNode] rawCode preview (first 1000 chars):");
  console.log(rawCode.substring(0, 1000));
  console.log("...");

  // 调试：检查是否包含图片相关关键字
  console.log(
    "🔍 [ImageDownloadNode] Contains 'export const img':",
    rawCode.includes("export const img"),
  );
  console.log(
    "🔍 [ImageDownloadNode] Contains 'localhost:3845':",
    rawCode.includes("localhost:3845"),
  );
  console.log("🔍 [ImageDownloadNode] Contains 'assets.ts':", rawCode.includes("assets.ts"));

  // ========== 1. 提取 assets.ts 中的图片 URL ==========
  console.log("📋 [ImageDownloadNode] 步骤 1/4: 提取图片 URL...");

  const imageUrls = extractImageUrls(rawCode);

  console.log("🔍 [ImageDownloadNode] extractImageUrls returned:", imageUrls.length, "items");

  if (imageUrls.length === 0) {
    console.log("ℹ️  [ImageDownloadNode] 未发现图片链接，跳过处理");
    // 调试：尝试手动搜索图片模式
    const manualSearch = rawCode.match(/http:\/\/localhost:3845\/assets\/[^"'\s]+/g);
    console.log(
      "🔍 [ImageDownloadNode] Manual search for localhost URLs:",
      manualSearch?.length || 0,
      "found",
    );
    if (manualSearch && manualSearch.length > 0) {
      console.log("🔍 [ImageDownloadNode] Sample URLs found:", manualSearch.slice(0, 3));
    }
    return {};
  }

  console.log(`   找到 ${imageUrls.length} 个图片链接:`);
  imageUrls.slice(0, 5).forEach((img) => {
    console.log(`   - ${img.varName}: ${img.url.substring(0, 60)}...`);
  });
  if (imageUrls.length > 5) {
    console.log(`   ... 还有 ${imageUrls.length - 5} 个`);
  }

  // ========== 2. 并行下载所有图片 ==========
  console.log("\n📥 [ImageDownloadNode] 步骤 2/4: 下载图片...");
  console.log("🔍 [ImageDownloadNode] 开始下载", imageUrls.length, "张图片...");

  const downloadResults = await Promise.all(
    imageUrls.map(async (img, index) => {
      console.log(`🔍 [ImageDownloadNode] 下载 [${index + 1}/${imageUrls.length}]: ${img.url}`);
      const result = await downloadImage(img.url);
      if (result) {
        console.log(`   ✓ 成功: ${result.buffer.length} bytes, type: ${result.contentType}`);
      } else {
        console.log(`   ✗ 失败`);
      }
      return {
        ...img,
        downloaded: result,
      };
    }),
  );

  const successfulDownloads = downloadResults.filter((r) => r.downloaded !== null);
  const failedDownloads = downloadResults.filter((r) => r.downloaded === null);

  console.log(`   成功下载: ${successfulDownloads.length} 个`);
  if (failedDownloads.length > 0) {
    console.log(`   下载失败: ${failedDownloads.length} 个（将保留原始链接）`);
  }

  if (successfulDownloads.length === 0) {
    console.log("⚠️ [ImageDownloadNode] 所有图片下载失败，保留原始链接");
    return {};
  }

  // ========== 3. 并行上传到 OSS ==========
  console.log("\n☁️  [ImageDownloadNode] 步骤 3/4: 上传到 OSS...");
  console.log("🔍 [ImageDownloadNode] 准备上传", successfulDownloads.length, "张图片到 OSS...");

  const uploadInput = successfulDownloads.map((item) => ({
    buffer: item.downloaded!.buffer,
    originalUrl: item.url,
    contentType: item.downloaded!.contentType,
  }));

  console.log("🔍 [ImageDownloadNode] uploadInput prepared, calling batchUploadImagesToOSS...");

  let uploadResults;
  try {
    uploadResults = await batchUploadImagesToOSS(uploadInput);
    console.log(
      "🔍 [ImageDownloadNode] batchUploadImagesToOSS returned",
      uploadResults.length,
      "results",
    );
  } catch (error) {
    console.error("❌ [ImageDownloadNode] batchUploadImagesToOSS threw error:", error);
    return {};
  }

  const successfulUploads = uploadResults.filter((r) => r.success);
  const failedUploads = uploadResults.filter((r) => !r.success);

  console.log(`   上传成功: ${successfulUploads.length} 个`);
  if (failedUploads.length > 0) {
    console.log(`   上传失败: ${failedUploads.length} 个（将保留原始链接）`);
    failedUploads.forEach((f) => {
      console.log(`   ✗ ${f.originalUrl}: ${f.error}`);
    });
  }

  // 打印成功上传的 OSS URL
  successfulUploads.forEach((s) => {
    console.log(`   ✓ ${s.originalUrl.substring(0, 50)}... -> ${s.ossUrl}`);
  });

  // ========== 4. 替换 rawCode 中的 URL ==========
  console.log("\n🔄 [ImageDownloadNode] 步骤 4/5: 替换图片链接...");

  let updatedRawCode = rawCode;
  let replacedCount = 0;

  for (const result of uploadResults) {
    if (result.success && result.ossUrl !== result.originalUrl) {
      // 替换所有出现的原始 URL
      const beforeLength = updatedRawCode.length;
      updatedRawCode = updatedRawCode.split(result.originalUrl).join(result.ossUrl);
      if (updatedRawCode.length !== beforeLength) {
        replacedCount++;
      }
    }
  }

  console.log(`   替换完成: ${replacedCount} 个 URL`);

  // ========== 5. 统一图片变量名（避免 imgImage11 vs img11 不一致） ==========
  console.log("\n🔧 [ImageDownloadNode] 步骤 5/5: 统一图片变量名...");

  // 5.1 收集所有已定义的图片变量名
  const definedVarsRegex = /(?:export\s+)?const\s+(img\w+)\s*=/g;
  const definedVars = new Set<string>();
  let varMatch;
  while ((varMatch = definedVarsRegex.exec(updatedRawCode)) !== null) {
    definedVars.add(varMatch[1]);
  }
  console.log(`   📋 已定义的图片变量: ${definedVars.size} 个`);

  // 5.2 建立规范化映射，避免冲突
  const renameMap = new Map<string, string>(); // oldName -> newName

  for (const varName of definedVars) {
    const normalizedName = normalizeAssetVarName(varName);
    if (normalizedName !== varName) {
      // 检查目标名是否已存在
      if (definedVars.has(normalizedName)) {
        // 冲突：目标名已存在，反向操作 - 把短名引用改为长名
        // 例如: img11 已存在，imgImage11 也存在
        // 组件中可能用 img11 引用的是 imgImage11 的资源
        // 我们保留两者，但在方案C中处理引用修复
        console.log(`   ⚠️ 冲突: ${varName} → ${normalizedName} (目标已存在，跳过)`);
      } else {
        renameMap.set(varName, normalizedName);
      }
    }
  }

  // 5.3 执行重命名
  let normalizedCount = 0;
  for (const [oldName, newName] of renameMap) {
    // 替换所有出现（声明和引用）
    const regex = new RegExp(`\\b${oldName}\\b`, "g");
    const beforeNormalize = updatedRawCode;
    updatedRawCode = updatedRawCode.replace(regex, newName);

    if (updatedRawCode !== beforeNormalize) {
      normalizedCount++;
      console.log(`   ✓ ${oldName} → ${newName}`);
    }
  }

  console.log(`   统一完成: ${normalizedCount} 个变量名`);

  // ========== 完成 ==========
  console.log("\n" + "=".repeat(80));
  console.log("✅ [ImageDownloadNode] 图片处理完成");
  console.log(`   总计: ${imageUrls.length} 个图片`);
  console.log(`   成功上传并替换: ${successfulUploads.length} 个`);
  console.log(`   保留原链接: ${failedDownloads.length + failedUploads.length} 个`);
  console.log("=".repeat(80) + "\n");

  return {
    rawCode: updatedRawCode,
  };
};
