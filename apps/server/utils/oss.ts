/**
 * 阿里云 OSS 客户端工具
 *
 * 职责：
 * - 初始化 ali-oss 客户端
 * - 提供图片上传方法，返回公网可访问的 URL
 */

import OSS from "ali-oss";
import { ossConfig } from "../config/oss.js";
import crypto from "crypto";

// 懒加载 OSS 客户端实例
let ossClient: OSS | null = null;

/**
 * 获取 OSS 客户端实例（单例模式）
 * 供其他模块复用
 */
export function getOSSClient(): OSS {
  if (!ossClient) {
    if (!ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.bucket) {
      throw new Error(
        "OSS 配置不完整，请检查 .env 文件中的 ALI_OSS_AK, ALI_OSS_SK, ALI_OSS_BUCKET",
      );
    }

    ossClient = new OSS({
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      bucket: ossConfig.bucket,
      endpoint: ossConfig.endpoint,
      secure: ossConfig.secure ?? true,
    });
  }
  return ossClient;
}

/**
 * 根据 Content-Type 推断文件扩展名
 */
function getExtFromContentType(contentType: string): string {
  const typeMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/bmp": "bmp",
    "image/x-icon": "ico",
  };
  return typeMap[contentType.toLowerCase()] || "png";
}

/**
 * 根据 URL 路径推断文件扩展名
 */
function getExtFromUrl(url: string): string {
  const match = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (match) {
    const ext = match[1].toLowerCase();
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  }
  return "png";
}

/**
 * 上传图片到 OSS
 *
 * @param buffer - 图片二进制数据
 * @param options - 可选配置
 * @returns 公网可访问的 OSS URL
 */
export async function uploadImageToOSS(
  buffer: Buffer,
  options?: {
    /** 原始 URL，用于推断扩展名 */
    originalUrl?: string;
    /** Content-Type，用于推断扩展名 */
    contentType?: string;
    /** 自定义文件名（不含路径和扩展名） */
    fileName?: string;
  },
): Promise<string> {
  const client = getOSSClient();

  // 确定文件扩展名
  let ext = "png";
  if (options?.contentType) {
    ext = getExtFromContentType(options.contentType);
  } else if (options?.originalUrl) {
    ext = getExtFromUrl(options.originalUrl);
  }

  // 生成文件名：使用内容哈希确保唯一性
  const hash = crypto.createHash("md5").update(buffer).digest("hex").slice(0, 12);
  const timestamp = Date.now();
  const fileName = options?.fileName || `${timestamp}-${hash}`;

  // OSS 路径：figma-images/YYYY-MM-DD/filename.ext
  const date = new Date().toISOString().slice(0, 10);
  const ossPath = `figma-images/${date}/${fileName}.${ext}`;

  // 上传到 OSS
  const result = await client.put(ossPath, buffer, {
    headers: {
      "Content-Type": options?.contentType || `image/${ext === "svg" ? "svg+xml" : ext}`,
      "Cache-Control": "public, max-age=31536000", // 缓存一年
    },
  });

  // 返回公网 URL
  // 格式：https://{bucket}.{endpoint}/{path}
  const publicUrl = `https://${ossConfig.bucket}.${ossConfig.endpoint}/${ossPath}`;

  return publicUrl;
}

/**
 * 批量上传图片到 OSS
 *
 * @param images - 图片数组 [{ buffer, originalUrl, contentType }]
 * @returns 上传结果数组 [{ originalUrl, ossUrl, success, error? }]
 */
export async function batchUploadImagesToOSS(
  images: Array<{
    buffer: Buffer;
    originalUrl: string;
    contentType?: string;
  }>,
): Promise<
  Array<{
    originalUrl: string;
    ossUrl: string;
    success: boolean;
    error?: string;
  }>
> {
  const results = await Promise.all(
    images.map(async (img) => {
      try {
        const ossUrl = await uploadImageToOSS(img.buffer, {
          originalUrl: img.originalUrl,
          contentType: img.contentType,
        });
        return {
          originalUrl: img.originalUrl,
          ossUrl,
          success: true,
        };
      } catch (error) {
        console.error(`❌ 上传图片失败: ${img.originalUrl}`, error);
        return {
          originalUrl: img.originalUrl,
          ossUrl: img.originalUrl, // 失败时保留原始链接
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  return results;
}
