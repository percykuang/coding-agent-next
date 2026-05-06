import express, { Request, Response } from "express";
import multer from "multer";
import fs from "fs/promises";
import path from "path";
import { getOSSClient } from "../utils/oss.js";
import { ossConfig } from "../config/oss.js";
import { resolveFromAppRoot } from "../utils/runtimePaths.js";

const router = express.Router();

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/bmp": ".bmp",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
};

function hasOssConfig() {
  return Boolean(
    ossConfig.accessKeyId && ossConfig.accessKeySecret && ossConfig.bucket && ossConfig.endpoint,
  );
}

function getExtensionFromFile(file: Express.Multer.File) {
  const originalExt = path.extname(file.originalname || "").toLowerCase();
  if (SUPPORTED_IMAGE_EXTENSIONS.has(originalExt)) {
    return originalExt === ".jpeg" ? ".jpg" : originalExt;
  }

  const mimeExt = MIME_TO_EXTENSION[file.mimetype.toLowerCase()];
  if (mimeExt) {
    return mimeExt;
  }

  return ".png";
}

function getUploadDisplayName(file: Express.Multer.File, ext: string) {
  const originalName = file.originalname?.trim();
  if (originalName) {
    return originalName;
  }

  return `image-${Date.now()}${ext}`;
}

function encodeStorageKey(storageKey: string) {
  return storageKey.split("/").map(encodeURIComponent).join("/");
}

function buildLocalFileUrl(storageKey: string) {
  return `/api/upload/files/${encodeStorageKey(storageKey)}`;
}

async function ensureLocalUploadDir() {
  const uploadDir = resolveFromAppRoot(import.meta.url, "../../storage/uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  return uploadDir;
}

async function saveFileLocally(file: Express.Multer.File) {
  const ext = getExtensionFromFile(file);
  const now = new Date();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const filename = `${crypto.randomUUID()}${ext}`;
  const storageKey = `images/${year}/${month}/${filename}`;
  const uploadDir = await ensureLocalUploadDir();
  const absolutePath = path.join(uploadDir, storageKey);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, file.buffer);

  return {
    url: buildLocalFileUrl(storageKey),
    name: getUploadDisplayName(file, ext),
  };
}

async function uploadFileToOss(file: Express.Multer.File) {
  const client = getOSSClient();
  const ext = getExtensionFromFile(file);
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `images/${date}-${crypto.randomUUID()}${ext}`;
  const result = await client.put(filename, file.buffer);

  let fileUrl = result.url;
  if (!fileUrl) {
    const protocol = ossConfig.secure ? "https" : "http";
    fileUrl = `${protocol}://${ossConfig.bucket}.${ossConfig.endpoint}/${filename}`;
  }

  if (fileUrl.startsWith("http://")) {
    fileUrl = fileUrl.replace("http://", "https://");
  }

  return {
    url: fileUrl,
    name: getUploadDisplayName(file, ext),
  };
}

// 配置 Multer 内存存储（文件不落地，后续按配置上传 OSS 或保存到本地）
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    console.log("\n🔵 [Multer] 开始处理文件:");
    console.log(`   - 原始文件名: ${file.originalname}`);
    console.log(`   - MIME 类型: ${file.mimetype}`);
    console.log(`   - 字段名: ${file.fieldname}`);

    const ext = path.extname(file.originalname || "").toLowerCase();
    const isImageMime = file.mimetype.toLowerCase().startsWith("image/");
    const isSupportedExt = ext ? SUPPORTED_IMAGE_EXTENSIONS.has(ext) : false;

    if (!isImageMime && !isSupportedExt) {
      console.log(`❌ [Multer] 不支持的文件类型: ${ext || "(none)"}`);
      return cb(new Error("Unsupported file type. Only image files are allowed."));
    }

    cb(null, true);
  },
});

router.get("/files/*", async (req: Request, res: Response) => {
  const requestedPath = req.params[0];

  if (!requestedPath) {
    res.status(400).json({
      error: "Invalid upload path",
      details: "上传路径非法",
    });
    return;
  }

  const storageKey = decodeURIComponent(requestedPath);
  if (storageKey.startsWith("/") || storageKey.includes("..") || storageKey.includes("\\")) {
    res.status(400).json({
      error: "Invalid upload path",
      details: "上传路径非法",
    });
    return;
  }

  const uploadDir = await ensureLocalUploadDir();
  const absolutePath = path.resolve(uploadDir, storageKey);
  if (absolutePath !== uploadDir && !absolutePath.startsWith(`${uploadDir}${path.sep}`)) {
    res.status(400).json({
      error: "Invalid upload path",
      details: "上传路径非法",
    });
    return;
  }

  res.sendFile(absolutePath, (err) => {
    if (!err) {
      return;
    }

    if ("statusCode" in err && err.statusCode === 404) {
      res.status(404).json({
        error: "File not found",
        details: "文件不存在",
      });
      return;
    }

    console.error("❌ [Upload] 读取本地文件失败:", err);
    if (!res.headersSent) {
      res.status(500).json({
        error: "Read file failed",
        details: "读取图片失败",
      });
    }
  });
});

router.post(
  "/image",
  (_req, _res, next) => {
    console.log("\n🔵 [Upload API] 收到 POST 请求");
    next();
  },
  upload.single("file"),
  async (req: Request, res: Response) => {
    console.log("🔵 [Upload] 进入路由处理函数");

    try {
      if (!req.file) {
        console.log("❌ [Upload] 错误: 没有接收到文件");
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      console.log("✓ [Upload] 文件接收成功");

      const payload = hasOssConfig()
        ? await uploadFileToOss(req.file)
        : await saveFileLocally(req.file);

      console.log(`✅ [Upload] 上传成功: ${payload.url}\n`);
      res.status(200).json(payload);
    } catch (error) {
      console.error("❌ [Upload] 上传失败:");
      console.error("   - 错误信息:", error instanceof Error ? error.message : error);

      if (req.file) {
        console.error("   - 文件信息:", {
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: `${(req.file.size / 1024).toFixed(2)} KB`,
        });
      }

      if (error instanceof Error && error.stack) {
        console.error("   - 堆栈追踪:", error.stack);
      }

      res.status(500).json({
        error: "Upload failed",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
);

router.use((err: any, _req: Request, res: Response, _next: any) => {
  console.error("\n❌ [Multer] 中间件错误:");
  console.error("   - 错误代码:", err.code);
  console.error("   - 错误信息:", err.message);

  if (err instanceof multer.MulterError) {
    console.error("   - Multer 错误类型:", err.code);

    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: "File too large",
        details: "图片大小超过 10MB 限制",
      });
    }

    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        error: "Unexpected field",
        details: "文件字段名错误，应为 'file'",
      });
    }

    return res.status(400).json({
      error: "Upload error",
      details: err.message,
    });
  }

  res.status(500).json({
    error: "Server error",
    details: err.message || "Unknown error",
  });
});

export default router;
