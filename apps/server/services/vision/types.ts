/**
 * Vision 相关类型定义
 */

export interface VisionAnalysisResult {
  summary: string;
  layout: string[];
  components: string[];
  style: string[];
  interactionHints: string[];
}

export interface VisionAnalysisInput {
  imageUrls: string[];
  userText?: string;
}
