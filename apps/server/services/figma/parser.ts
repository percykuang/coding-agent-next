/**
 * Figma 数据解析器
 * 将 Figma MCP 返回的数据转换为项目需要的格式
 * 核心功能：
 * - 解析元数据，提取页面和组件信息
 * - 解析设计上下文，提取帧和布局信息
 * - 解析变量定义，转换为设计令牌（Design Tokens）
 * - 提供友好的数据打印功能，便于调试和查看解析结果
 */

import type {
  FigmaDesignData,
  FigmaParsedData,
  FigmaPage,
  FigmaComponent,
  FigmaDesignTokens,
} from "./types.js";

/**
 * 解析 XML 元数据，提取页面和组件信息
 */
function parseMetadata(xmlString: string): {
  pages: FigmaPage[];
  components: Map<string, number>;
} {
  const pages: FigmaPage[] = [];
  const componentCounts = new Map<string, number>();

  try {
    // 提取 page 标签（顶层 canvas）作为页面
    const pageRegex = /<page[^>]*name="([^"]*)"[^>]*>/g;
    let match;

    while ((match = pageRegex.exec(xmlString)) !== null) {
      const pageName = match[1];

      // 过滤掉特殊页面
      if (pageName && !pageName.startsWith("_")) {
        pages.push({
          name: pageName,
          route: `/${pageName.toLowerCase().replace(/\s+/g, "-")}`,
          frames: [],
        });
      }
    }

    // 注意：真实组件应该从 rawData.components 提取，这里只是兼容旧逻辑
    // 实际使用时会被主函数中的 components 参数覆盖
  } catch (error) {
    console.error("Error parsing metadata XML:", error);
  }

  return { pages, components: componentCounts };
}

/**
 * 从设计上下文中提取详细信息
 */
function parseContext(context: any): { frames: any[] } {
  const frames: any[] = [];

  try {
    if (context && context.layers) {
      // 遍历图层结构
      context.layers.forEach((layer: any) => {
        if (layer.type === "FRAME" || layer.type === "COMPONENT") {
          frames.push({
            id: layer.id,
            name: layer.name,
            type: layer.type,
            width: layer.width,
            height: layer.height,
            x: layer.x || 0,
            y: layer.y || 0,
          });
        }
      });
    }
  } catch (error) {
    console.error("Error parsing context:", error);
  }

  return { frames };
}

/**
 * 解析 Figma 变量定义，转换为 CSS Design Tokens
 */
function parseVariables(variables: any): FigmaDesignTokens {
  const colors: Record<string, string> = {};
  const fonts: Record<string, string> = {};
  const spacing: Record<string, string> = {};

  try {
    if (variables && typeof variables === "object") {
      Object.entries(variables).forEach(([key, value]: [string, any]) => {
        const name = value.name || key;

        // 解析颜色变量
        if (value.resolvedType === "COLOR" || value.type === "COLOR") {
          const colorValue = value.valuesByMode
            ? Object.values(value.valuesByMode)[0]
            : value.value;

          if (colorValue && typeof colorValue === "object") {
            const { r, g, b, a = 1 } = colorValue;
            const hex = rgbToHex(r * 255, g * 255, b * 255);
            colors[name] = a < 1 ? `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})` : hex;
          }
        }

        // 解析字体变量
        if (value.resolvedType === "FONT" || value.type === "FONT") {
          fonts[name] = value.value || "inherit";
        }

        // 解析间距变量
        if (value.resolvedType === "FLOAT" || value.type === "FLOAT") {
          if (name.toLowerCase().includes("spacing") || name.toLowerCase().includes("gap")) {
            spacing[name] = `${value.value || 0}px`;
          }
        }
      });
    }
  } catch (error) {
    console.error("Error parsing variables:", error);
  }

  return { colors, fonts, spacing };
}

/**
 * RGB 转 Hex 颜色
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, n))).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * 主解析函数
 * 将 Figma MCP Server 返回的原始数据转换为应用所需格式
 */
export function parseFigmaData(rawData: FigmaDesignData): FigmaParsedData {
  console.log("🔄 Parsing Figma data...");

  let pages: FigmaPage[] = [];
  let frames: any[] = [];
  const sharedComponents: FigmaComponent[] = [];
  let designTokens: FigmaDesignTokens;

  // 检查 context 是否是代码生成格式
  if (rawData.context?.type === "generated_code") {
    console.log("📝 检测到 Figma MCP 代码生成格式");

    // 打印生成的代码（调试用）
    const generatedCode = rawData.context.code || "";
    console.log("\n" + "=".repeat(80));
    console.log("📦 FIGMA MCP 生成的代码预览");
    console.log("=".repeat(80));

    // 打印开头部分（图片常量）
    console.log("\n📸 图片常量定义部分:");
    console.log(generatedCode.substring(0, 1000));
    console.log("...\n");

    // 查找组件定义
    const exportMatch = generatedCode.match(/export default function (\w+)/);
    const componentName = exportMatch ? exportMatch[1] : "Unknown";

    // 查找 JSX 部分
    const jsxStart = generatedCode.indexOf("return (");
    if (jsxStart > 0) {
      console.log("\n⚛️  组件定义和 JSX 部分:");
      console.log(generatedCode.substring(jsxStart - 200, jsxStart + 1500));
      console.log("...\n");
    }

    // 打印结尾部分
    console.log("\n📝 代码结尾部分:");
    console.log(generatedCode.substring(generatedCode.length - 500));

    console.log("=".repeat(80));
    console.log("\n📊 代码统计:");
    console.log("   - 组件名称:", componentName);
    console.log("   - 总长度:", generatedCode.length, "字符");
    console.log("   - 行数:", generatedCode.split("\n").length);
    console.log("   - 图片常量:", (generatedCode.match(/const img\w+ =/g) || []).length);
    console.log("   - div 元素:", (generatedCode.match(/<div/g) || []).length);
    console.log("   - img 元素:", (generatedCode.match(/<img/g) || []).length);
    console.log("");
    console.log("");

    // 从 metadata XML 中提取 Frame 信息
    const frameMatch = rawData.metadata.match(
      /<frame[^>]*name="([^"]*)"[^>]*width="([^"]*)"[^>]*height="([^"]*)"/,
    );

    if (frameMatch) {
      const frameName = frameMatch[1];
      const width = parseFloat(frameMatch[2]);
      const height = parseFloat(frameMatch[3]);

      // 创建一个页面，包含这个 Frame
      pages = [
        {
          name: frameName,
          route: `/${frameName.toLowerCase().replace(/\s+/g, "-")}`,
          frames: [
            {
              id: "generated-frame",
              name: frameName,
              type: "FRAME",
              width,
              height,
              x: 0,
              y: 0,
              generatedCode: rawData.context.code, // 保存生成的代码
            },
          ],
        },
      ];

      console.log(`   ✓ 提取 Frame: ${frameName} (${width}x${height})`);
    }

    // 从生成的代码中提取组件信息（如果有的话）
    const componentMatches = rawData.context.code?.match(/const\s+(\w+)\s*=\s*\(/g);
    if (componentMatches) {
      componentMatches.forEach((match: string) => {
        const componentName = match.match(/const\s+(\w+)/)?.[1];
        if (componentName && componentName !== "imgRectangle") {
          sharedComponents.push({
            name: componentName,
            instances: 1,
            figmaNodeId: "generated",
          });
        }
      });
    }

    // 解析变量（如果有）
    designTokens = parseVariables(rawData.variables);
  } else {
    // 原有的 JSON 格式解析逻辑
    console.log("📊 使用 JSON 格式解析");

    // 1. 解析元数据（页面）
    const parsedMeta = parseMetadata(rawData.metadata);
    pages = parsedMeta.pages;

    // 2. 解析设计上下文（frames）
    const parsedContext = parseContext(rawData.context);
    frames = parsedContext.frames;

    // 3. 将 frames 分配到对应的 pages
    pages.forEach((page) => {
      page.frames = frames.filter((frame) =>
        frame.name.toLowerCase().includes(page.name.toLowerCase()),
      );
    });

    // 4. 从 Figma API 的 components 对象提取组件
    if (rawData.context?.components) {
      Object.entries(rawData.context.components).forEach(([nodeId, component]: [string, any]) => {
        sharedComponents.push({
          name: component.name || nodeId,
          instances: 1,
          figmaNodeId: nodeId,
        });
      });
    }

    // 5. 解析设计令牌
    designTokens = parseVariables(rawData.variables);
  }

  console.log("✅ Figma data parsed successfully");
  console.log(`   - Pages: ${pages.length}`);
  console.log(`   - Shared Components: ${sharedComponents.length}`);
  console.log(`   - Colors: ${Object.keys(designTokens.colors).length}`);
  console.log(`   - Fonts: ${Object.keys(designTokens.fonts).length}`);
  console.log(`   - Spacing: ${Object.keys(designTokens.spacing).length}`);

  return {
    pages,
    sharedComponents,
    designTokens,
    layout: rawData.context?.layout,
  };
}

/**
 * 友好地打印解析后的数据
 */
export function prettyPrintParsedData(data: FigmaParsedData): void {
  console.log("\n" + "=".repeat(80));
  console.log("📊 PARSED FIGMA DATA");
  console.log("=".repeat(80) + "\n");

  // 打印页面信息
  console.log("📄 PAGES:");
  if (data.pages.length === 0) {
    console.log("   (No pages found)");
  } else {
    data.pages.forEach((page, index) => {
      console.log(`   ${index + 1}. ${page.name}`);
      console.log(`      Route: ${page.route}`);
      console.log(`      Frames: ${page.frames.length}`);
      if (page.frames.length > 0) {
        page.frames.forEach((frame) => {
          console.log(`         - ${frame.name} (${frame.width}x${frame.height})`);
        });
      }
    });
  }

  // 打印共享组件
  console.log("\n🧩 SHARED COMPONENTS:");
  if (data.sharedComponents.length === 0) {
    console.log("   (No shared components found)");
  } else {
    data.sharedComponents.forEach((comp, index) => {
      console.log(`   ${index + 1}. ${comp.name}`);
      console.log(`      Instances: ${comp.instances}`);
      console.log(`      Node ID: ${comp.figmaNodeId}`);
    });
  }

  // 打印设计令牌
  console.log("\n🎨 DESIGN TOKENS:");

  console.log("   Colors:");
  const colorEntries = Object.entries(data.designTokens.colors);
  if (colorEntries.length === 0) {
    console.log("      (No colors defined)");
  } else {
    colorEntries.forEach(([name, value]) => {
      console.log(`      - ${name}: ${value}`);
    });
  }

  console.log("   Fonts:");
  const fontEntries = Object.entries(data.designTokens.fonts);
  if (fontEntries.length === 0) {
    console.log("      (No fonts defined)");
  } else {
    fontEntries.forEach(([name, value]) => {
      console.log(`      - ${name}: ${value}`);
    });
  }

  console.log("   Spacing:");
  const spacingEntries = Object.entries(data.designTokens.spacing);
  if (spacingEntries.length === 0) {
    console.log("      (No spacing defined)");
  } else {
    spacingEntries.forEach(([name, value]) => {
      console.log(`      - ${name}: ${value}`);
    });
  }

  console.log("\n" + "=".repeat(80) + "\n");
}
