// 阿里云 OSS 配置类型
export interface OSSConfig {
  accessKeyId: string;
  accessKeySecret: string;
  endpoint: string;
  bucket: string;
  region?: string;
  secure?: boolean;
}

// 建议将这些放在 .env 文件中
export const ossConfig: OSSConfig = {
  accessKeyId: process.env.ALI_OSS_AK || "",
  accessKeySecret: process.env.ALI_OSS_SK || "",
  endpoint: process.env.ALI_OSS_ENDPOINT || "oss-cn-hangzhou.aliyuncs.com", // 你的 OSS endpoint
  bucket: process.env.ALI_OSS_BUCKET || "",
  secure: true, // 使用 https
};
