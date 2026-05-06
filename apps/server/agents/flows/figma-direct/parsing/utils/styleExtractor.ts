/**
 * 样式提取器
 *
 * 从 Tailwind 类名和内联 style 中提取布局定位信息。
 * 用于将 JsxElement 转换为带坐标信息的 LayoutBlock。
 *
 * 支持的样式来源:
 * 1. Tailwind 定位类: top-[100px], left-[200px], w-[300px], h-[400px], absolute
 * 2. 内联 style: { top: '100px', left: '200px', width: '300px', height: '400px' }
 * 3. 固定 Tailwind 尺寸: w-full, h-screen 等
 */

import type { JsxElement, LayoutBlock } from "../schemas/parsingSchema.js";

/** 数值提取的布局信息 */
interface LayoutInfo {
  top: number;
  left: number;
  width: number;
  height: number;
  isBackground: boolean;
}

/**
 * 从 JsxElement 提取布局信息，构建 LayoutBlock
 */
export function extractLayoutBlock(elem: JsxElement, index: number): LayoutBlock {
  const layout = extractLayoutInfo(elem.className, elem.inlineStyle);
  const texts = extractTexts(elem.rawJsx);
  const usedAssets = extractUsedAssets(elem.rawJsx);

  // 复合背景检测：原始尺寸检测 + 装饰性元素检测
  let isBackground = layout.isBackground;
  if (!isBackground) {
    isBackground = detectDecorativeElement(texts, usedAssets);
  }

  return {
    index,
    rawJsx: elem.rawJsx,
    top: layout.top,
    left: layout.left,
    width: layout.width,
    height: layout.height,
    texts,
    usedAssets,
    childrenCount: elem.childrenCount,
    isBackground,
    nodeId: elem.nodeId,
    dataName: elem.dataName,
  };
}

/**
 * 综合提取布局坐标信息（优先 Tailwind，fallback inline style）
 */
function extractLayoutInfo(className: string | null, inlineStyle: string | null): LayoutInfo {
  const tw = parseTailwindLayout(className);
  const inline = parseInlineStyleLayout(inlineStyle);

  // Tailwind 优先，inline 补充
  const top = tw.top !== 0 ? tw.top : inline.top;
  const left = tw.left !== 0 ? tw.left : inline.left;
  const width = tw.width !== 0 ? tw.width : inline.width;
  const height = tw.height !== 0 ? tw.height : inline.height;

  // 判断是否为背景元素:
  // 宽度接近全屏 (>= 1200px) 且高度很大 (>= 500px)
  // 或者包含 w-full/w-screen 类名
  const isBackground = detectBackground(className, width, height);

  return { top, left, width, height, isBackground };
}

// ==================== Tailwind 解析 ====================

interface TailwindLayout {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * 从 Tailwind 类名中提取定位数值
 * 支持格式: top-[100px], left-[200px], w-[300px], h-[400px]
 */
function parseTailwindLayout(className: string | null): TailwindLayout {
  if (!className) return { top: 0, left: 0, width: 0, height: 0 };

  const result: TailwindLayout = { top: 0, left: 0, width: 0, height: 0 };

  // top-[Npx] or top-N
  const topMatch = className.match(/\btop-\[(-?\d+(?:\.\d+)?)px\]/);
  if (topMatch) result.top = parseFloat(topMatch[1]);

  // left-[Npx] or left-N
  const leftMatch = className.match(/\bleft-\[(-?\d+(?:\.\d+)?)px\]/);
  if (leftMatch) result.left = parseFloat(leftMatch[1]);

  // w-[Npx]
  const widthMatch = className.match(/\bw-\[(-?\d+(?:\.\d+)?)px\]/);
  if (widthMatch) result.width = parseFloat(widthMatch[1]);

  // h-[Npx]
  const heightMatch = className.match(/\bh-\[(-?\d+(?:\.\d+)?)px\]/);
  if (heightMatch) result.height = parseFloat(heightMatch[1]);

  return result;
}

// ==================== Inline Style 解析 ====================

interface InlineLayout {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * 从 inlineStyle 字符串中提取定位数值
 * 输入格式: "top:100px;left:200px;width:300px;height:400px"
 */
function parseInlineStyleLayout(inlineStyle: string | null): InlineLayout {
  if (!inlineStyle) return { top: 0, left: 0, width: 0, height: 0 };

  const result: InlineLayout = { top: 0, left: 0, width: 0, height: 0 };

  const pairs = inlineStyle.split(";");
  for (const pair of pairs) {
    const [key, value] = pair.split(":").map((s) => s.trim());
    if (!key || !value) continue;

    const num = parseFloat(value);
    if (isNaN(num)) continue;

    switch (key) {
      case "top":
        result.top = num;
        break;
      case "left":
        result.left = num;
        break;
      case "width":
        result.width = num;
        break;
      case "height":
        result.height = num;
        break;
    }
  }

  return result;
}

// ==================== 背景检测 ====================

/**
 * 检测是否为跨区域的背景元素
 */
function detectBackground(className: string | null, width: number, height: number): boolean {
  // 已知宽度大且高度大
  if (width >= 1200 && height >= 500) return true;

  // Tailwind 全宽类
  if (className) {
    const fullWidthClasses = /\b(w-full|w-screen|w-\[100%\]|w-\[100vw\])\b/;
    const largeHeight = height >= 500;
    if (fullWidthClasses.test(className) && largeHeight) return true;
  }

  return false;
}

// ==================== 装饰性元素检测 ====================

/** 装饰性图片变量名模式：Vector、Group、MaskGroup、Ellipse 开头（后跟可选数字） */
const DECORATIVE_ASSET_PATTERN = /^img(Vector|Group|MaskGroup|Ellipse)\d*$/;

/**
 * 检测是否为纯装饰性元素
 *
 * 判断标准：
 * 1. 没有文本内容（纯视觉装饰）
 * 2. 包含图片资源
 * 3. 所有图片变量名匹配装饰性模式（Vector/Group/MaskGroup/Ellipse）
 *
 * 这类元素通常是 Figma 设计中的浮动几何装饰（波浪、光斑、飘带等），
 * 不属于任何特定组件的内容，应被视为背景/可忽略元素。
 */
function detectDecorativeElement(texts: string[], usedAssets: string[]): boolean {
  // 有文本内容的不是纯装饰
  if (texts.length > 0) return false;
  // 没有图片资源的不判定
  if (usedAssets.length === 0) return false;
  // 所有资源都匹配装饰性模式
  return usedAssets.every((a) => DECORATIVE_ASSET_PATTERN.test(a));
}

// ==================== 文本提取 ====================

/**
 * 从 JSX 代码中提取所有文本内容
 * 简单实现：取 > 和 < 之间的非空文本
 */
export function extractTexts(rawJsx: string): string[] {
  const texts: string[] = [];

  // 匹配 >text< 之间的文本
  const textRegex = />([^<>{]+)</g;
  let match;
  while ((match = textRegex.exec(rawJsx)) !== null) {
    const text = match[1].trim();
    if (text && text.length > 0 && !/^\s*$/.test(text)) {
      texts.push(text);
    }
  }

  // 去重
  return [...new Set(texts)];
}

// ==================== 资源引用提取 ====================

/**
 * 从 JSX 代码中提取引用的图片变量名
 * 匹配 {imgXxx} 或 src={imgXxx} 等模式
 *
 * 注意：Figma 导出的变量名可能是 imgImage11（大写开头）也可能是 img12（数字开头）
 * 所以 img 后面的第一个字符必须允许数字
 */
export function extractUsedAssets(rawJsx: string): string[] {
  const assets: string[] = [];

  // 匹配 {imgXxx} 引用 — img 后面允许大写字母或数字开头
  const assetRegex = /\{(img[A-Za-z0-9][a-zA-Z0-9]*)\}/g;
  let match;
  while ((match = assetRegex.exec(rawJsx)) !== null) {
    assets.push(match[1]);
  }

  // 去重
  return [...new Set(assets)];
}
