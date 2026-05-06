/**
 * Figma 直连流程 - 组件代码生成节点
 *
 * 职责：
 * 1. 接收 sectionNamingResult + geometryGroupResult + astParserResult
 * 2. 对每个命名后的 Section，将其包含的 JSX 块拼接后交给 AI 重构为独立组件
 * 3. 输出 GeneratedFile[] 列表
 *
 * 流程位置: Refactoring Step 2 / 2
 * 上游: sectionNamingNode (sectionNamingResult)
 * 下游: assemblyNode (组装 Sandpack)
 *
 * 并行 AI 调用：每个 Section 独立调用一次 AI
 */

import type { T_SectionNamingOutput, T_GeneratedFile } from "../schemas/refactoringSchema.js";
import type { GeometryGroupOutput, AstParserOutput } from "../../parsing/schemas/parsingSchema.js";
import {
  getComponentGenSystemPrompt,
  getComponentGenHumanPrompt,
} from "../prompts/componentGenPrompts.js";
import { getModel } from "../../../../utils/model.js";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export const componentGenNode = async (state: any) => {
  console.log("\n" + "=".repeat(80));
  console.log("⚙️ [ComponentGenNode] 开始生成组件代码");
  console.log("=".repeat(80));

  const namingResult: T_SectionNamingOutput = state.sectionNamingResult;
  const groupResult: GeometryGroupOutput = state.geometryGroupResult;
  const astResult: AstParserOutput = state.astParserResult;

  // ========== 1. 校验输入 ==========
  if (!namingResult || !groupResult || !astResult) {
    console.error("❌ [ComponentGenNode] 错误: 缺少必要输入");
    throw new Error(
      "ComponentGenNode: 缺少必要输入 (sectionNamingResult / geometryGroupResult / astParserResult)",
    );
  }

  const sections = groupResult.sections;
  const namedSections = namingResult.namedSections;

  console.log(`📊 [ComponentGenNode] 需要生成 ${namedSections.length} 个组件`);

  // ========== 2. 对每个 Section 并行生成代码 ==========
  const systemPrompt = getComponentGenSystemPrompt();
  const model = getModel();

  const genPromises = namedSections.map(async (named) => {
    const section = sections.find((s) => s.index === named.index);
    if (!section) {
      console.warn(`⚠️ [ComponentGenNode] 未找到 Section ${named.index}`);
      return null;
    }

    // 拼接该 section 的所有 JSX 块
    const sectionJsx = section.blocks.map((b) => b.rawJsx).join("\n\n");

    // 背景 JSX — 过滤掉纯装饰性背景块（Variable/Group/MaskGroup/Ellipse），
    // 避免将浮动几何装饰传给 AI（这些装饰容易被错误渲染在不相关的组件中）
    const DECORATIVE_PATTERN = /^img(Vector|Group|MaskGroup|Ellipse)\d*$/;
    const meaningfulBgBlocks = section.backgroundBlocks.filter((b) => {
      // 如果背景块的所有图片资源都是装饰性模式，则过滤掉
      if (b.usedAssets.length > 0 && b.usedAssets.every((a) => DECORATIVE_PATTERN.test(a))) {
        console.log(`      🗑️ 过滤装饰性背景块: [${b.usedAssets.join(", ")}]`);
        return false;
      }
      return true;
    });

    const backgroundJsx =
      meaningfulBgBlocks.length > 0 ? meaningfulBgBlocks.map((b) => b.rawJsx).join("\n\n") : null;

    // 该 section 使用的图片资源（也排除纯装饰性资源）
    const usedAssets = section.allAssets.filter((a) => !DECORATIVE_PATTERN.test(a));

    const humanPrompt = getComponentGenHumanPrompt({
      componentName: named.componentName,
      description: named.description,
      sectionJsx,
      backgroundJsx,
      globalAssets: astResult.globalAssets,
      usedAssets,
      helperComponents: astResult.helperComponents,
    });

    console.log(
      `   ⏳ 生成 ${named.componentName}... (${section.totalBlocks} blocks, ${sectionJsx.length} chars)`,
    );

    try {
      const response = await model.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(humanPrompt),
      ]);

      // 提取返回的代码（去除可能的 markdown 代码块包裹）
      let code = typeof response.content === "string" ? response.content : String(response.content);

      code = stripCodeBlockMarkers(code);

      // 修正辅助组件的 import 方式：将 named import 转为 default import
      // 防止 AI 生成 `import { X } from "./X"` 而辅助组件只有 default export 的情况
      code = fixHelperImports(code, astResult.helperComponents);

      console.log(`   ✅ ${named.componentName} 生成成功 (${code.length} chars)`);

      return {
        filePath: `components/${named.fileName}.tsx`,
        code,
        componentName: named.componentName,
      } as T_GeneratedFile;
    } catch (error) {
      console.error(
        `   ❌ ${named.componentName} 生成失败:`,
        error instanceof Error ? error.message : error,
      );
      // 返回一个 placeholder 组件
      return {
        filePath: `components/${named.fileName}.tsx`,
        code: generatePlaceholderComponent(named.componentName, named.description),
        componentName: named.componentName,
      } as T_GeneratedFile;
    }
  });

  // 并行等待所有生成完成
  const results = await Promise.all(genPromises);
  const generatedFiles = results.filter(Boolean) as T_GeneratedFile[];

  // ========== 3. 打印结果 ==========
  console.log("\n✅ [ComponentGenNode] 组件代码生成完成");
  console.log(`   📊 生成结果: ${generatedFiles.length} 个文件`);
  generatedFiles.forEach((f) => {
    console.log(`      - ${f.filePath} (${f.code.length} chars)`);
  });
  console.log("");

  return {
    generatedFiles,
  };
};

// ==================== 工具函数 ====================

/**
 * 修正辅助组件的 import 方式
 * 将 named import（如 `import { RightC } from "./RightC"`）
 * 转为 default import（如 `import RightC from "./RightC"`）
 *
 * 这是因为辅助组件文件由 assemblyNode 的 wrapHelperComponent 生成，
 * 使用 export default 作为主要导出方式。虽然方案 A 已补充 named export 作为兜底，
 * 但仍应将 import 规范化为 default import 以保持代码一致性。
 */
function fixHelperImports(
  code: string,
  helperComponents: Array<{ name: string; rawCode: string }>,
): string {
  if (!helperComponents || helperComponents.length === 0) return code;

  let fixed = code;
  for (const helper of helperComponents) {
    // 匹配 `import { HelperName } from "./HelperName"` 或 `import { HelperName } from './HelperName'`
    const namedImportRegex = new RegExp(
      `import\\s*\\{\\s*${helper.name}\\s*\\}\\s*from\\s*["']\\.\\/${helper.name}["']`,
      "g",
    );
    const defaultImportStr = `import ${helper.name} from "./${helper.name}"`;

    if (namedImportRegex.test(fixed)) {
      // 重置 lastIndex（test() 会推进 g flag 的 lastIndex）
      namedImportRegex.lastIndex = 0;
      fixed = fixed.replace(namedImportRegex, defaultImportStr);
      console.log(`      🔧 修正 import: { ${helper.name} } → default import`);
    }
  }
  return fixed;
}

/**
 * 去除 markdown 代码块标记
 */
function stripCodeBlockMarkers(code: string): string {
  // 去除 ```tsx ... ``` 或 ```typescript ... ```
  let cleaned = code.trim();
  const codeBlockRegex = /^```(?:tsx|typescript|jsx|js)?\s*\n([\s\S]*?)\n```$/;
  const match = cleaned.match(codeBlockRegex);
  if (match) {
    cleaned = match[1];
  }
  return cleaned.trim();
}

/**
 * 生成占位组件（AI 失败时的 fallback）
 */
function generatePlaceholderComponent(componentName: string, description: string): string {
  return `// TODO: AI 生成失败，请手动实现
// 描述: ${description}

export default function ${componentName}() {
  return (
    <div className="p-4 border border-dashed border-gray-400 rounded">
      <p className="text-gray-500">[${componentName}] - ${description}</p>
    </div>
  );
}
`;
}
