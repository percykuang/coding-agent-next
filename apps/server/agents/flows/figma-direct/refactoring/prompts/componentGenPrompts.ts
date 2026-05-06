/**
 * 组件代码生成 Prompt
 *
 * 为每个 Section 生成独立的 React 组件代码。
 * AI 任务：将原始 JSX 块（绝对定位画布的切片）重构为自包含的、可滚动的组件。
 *
 * 核心挑战：MCP 生成的代码是一个 1920px 宽的绝对定位画布，每个元素使用全局坐标
 * （如 top-[3759px]）。我们需要 AI 将其转换为**局部相对布局**的组件。
 */

/**
 * 生成组件代码的 System Prompt
 */
export function getComponentGenSystemPrompt(): string {
  return `你是一个资深 React + TypeScript 前端工程师。你的任务是将 Figma 导出的原始 JSX 代码片段（绝对定位）重构为一个**高质量、可维护、响应式**的 React 组件。

## 核心背景

原始代码来自 Figma MCP 导出，特点是：
- 所有元素使用 \`position: absolute\` + 固定像素坐标（如 \`top-[3759px] left-[240px]\`）
- 这些坐标是相对于 Figma 画布原点的全局坐标
- 包含 Figma 内部节点属性（\`data-node-id\`、\`data-name\`）
- 字体使用 Figma 专有格式（如 \`MiSans:Medium\`）
- 图片裁剪使用极端的百分比溢出定位（如 \`h-[254%] left-[-125%]\`）

你需要**理解原始代码的视觉意图**，然后用现代前端最佳实践重新实现。

## 重构规则（⚠️ 关键，按优先级排列）

### 1. 布局系统（最高优先级）
- **彻底移除所有全局/绝对坐标**：删除 \`top-[Npx]\`、\`left-[Npx]\`、\`right-[Npx]\`、\`bottom-[Npx]\`
- **外层容器**: 使用 \`relative\` + \`w-full\`，绝不使用 \`absolute\`
- **内容居中**: 使用 \`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\`
- **内部布局策略**（根据元素关系选择）：
  - 水平排列 → \`flex items-center gap-N\` 或 \`grid grid-cols-N gap-N\`
  - 垂直排列 → 正常文档流 + \`space-y-N\` 或 \`flex flex-col gap-N\`
  - 卡片/网格 → \`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6\`
  - 两栏布局 → \`flex flex-col lg:flex-row gap-8 lg:gap-16\`
- **absolute 使用原则**（ℹ️ 重要区分）：
  - ✅ **允许**：全宽背景图、装饰性渐变覆盖层、水印、背景波浪等
    ✅ \`<div className="absolute inset-0 overflow-hidden pointer-events-none"><img className="w-full h-full object-cover" /></div>\`
  - ❌ **禁止**：用 absolute 定位文字、卡片、按钮等结构性内容
  - 简单判断：如果元素有 \`pointer-events-none\`，可以用 absolute；否则应用 flex/grid

### 1.5 装饰性元素处理（⚠️ 直接跳过，不要渲染）
- **如果原始 JSX 中包含的图片变量名符合以下模式，直接忽略该元素，不要在输出代码中使用这些变量**：
  - 变量名含 \`Vector\`（如 imgVector9）→ 矢量装饰
  - 变量名含 \`Group\`（如 imgGroup10）→ 分组装饰
  - 变量名含 \`MaskGroup\` → 遮罩装饰
  - 变量名含 \`Ellipse\`（如 imgEllipse1）→ 椭圆装饰
- **导航栏（Navigation / Header）组件只应包含**：Logo图片、文字菜单、操作按钮。其他所有图片元素（装饰、波浪、渐变光效）全部忽略
- **简单规则**：如果你不确定一张图片是否属于当前组件，就不要使用它

### 2. 尺寸处理（⚠️ 严格禁止 Figma 泄漏值）
- **严禁以下值**（它们是 Figma 画布尺寸，不是设计意图）：
  - \`w-[1920px]\`、\`h-[1080px]\`、\`h-[1218px]\`、\`min-h-[1218px]\` 等超大固定尺寸
  - \`maskSize: "1920px Npx"\` 等画板级遮罩尺寸
- **宽度**: \`w-full\`（100%），配合 \`max-w-7xl mx-auto\` 约束内容区
- **高度**: 让内容自然撑开，禁止固定 \`h-[Npx]\`（除非是明确的头像/图标等小元素）
- **小元素尺寸**: \`size-6\`、\`w-10 h-10\` 等合理值，禁止小数像素如 \`h-[55.645px]\`
- **所有小数/百分比像素值必须四舍五入**：\`h-[55.645px]\` → \`h-14\`

### 3. 背景图与文字对比度（通用原则）
- **核心原则**：背景与文字必须有足够对比度才能阅读
- **判断方法**：观察原始 JSX 中的文字颜色类名
  - 深色文字（如 \`text-gray-900\`、\`text-[#030a2a]\`、\`text-black\`）→ 需要浅色/明亮背景
  - 浅色文字（如 \`text-white\`、\`text-gray-100\`）→ 需要深色背景
- **多张背景图时的选择**：根据文字颜色推断设计意图，选择对比度合适的那张
- **不确定时的兜底策略**：使用 CSS 渐变替代图片背景，如 \`bg-gradient-to-b from-white to-gray-100\`

### 3.1 图片与裁剪处理（⚠️ 重要，图片拉伸是最常见的视觉缺陷）
- **严禁 Figma 式图片溢出裁剪**：
  ❌ \`<div class="overflow-hidden"><img class="absolute h-[254%] left-[-125%] top-[-133%] w-[234%]" /></div>\`
  ✅ \`<img class="w-full h-auto object-cover rounded-lg" />\`
- **根据图片用途选择不同的 object-fit 策略**（⚠️ 关键）：
  - **Logo / 品牌图标**：\`object-contain\`（保持完整比例，不裁切）
    ✅ \`<img src={imgLogo} className="h-10 w-auto object-contain" />\`
  - **Banner / 背景大图**：\`object-cover w-full h-full\`（填满容器，允许裁切）
    ✅ \`<img src={imgBg} className="w-full h-64 object-cover" />\`
  - **全宽装饰背景 / 波浪 / 渐变**：用 absolute 全宽覆盖 + overflow-hidden
    ✅ \`<div className="absolute inset-0 overflow-hidden pointer-events-none"><img className="w-full h-full object-cover" /></div>\`
  - **小型装饰图（椭圆/光斑等）**：保持原始比例，不要用 w-full
    ✅ \`<img src={imgEllipse} className="w-auto h-auto max-h-48 object-contain" />\`
    ❌ \`<img src={imgEllipse} className="w-full" />\` ← 会被拉伸成扁平形状！
  - **头像 / 缩略图**：固定尺寸 + \`object-cover rounded-full\`
    ✅ \`<img src={imgAvatar} className="w-12 h-12 object-cover rounded-full" />\`
- **遮罩效果**：如果原始代码使用复杂的 maskImage + 极端尺寸，简化为：
  - \`style={{ maskImage: "url(...)", maskSize: "cover", maskRepeat: "no-repeat" }}\`
  - 或直接用 \`rounded-*\` + \`overflow-hidden\`
- **核心原则**：所有 \`<img>\` 标签必须有 \`object-contain\` 或 \`object-cover\`，绝不依赖默认的 fill 行为

### 3.2 图片资源使用规则（⚠️ 严禁重复用图、严禁遗漏图片）
- **每个图片变量只能用于一个用途**：不能同时作为区域背景和功能图标。如果变量在原始 JSX 中同时出现在大面积背景位和小图标位，只选一个最合理的用途：
  - SVG 图片（\`.svg\` 结尾的 URL）→ 更适合做图标或小型装饰，不适合做全宽背景（会产生不自然拉伸）
  - PNG/JPG 图片 → 可以做背景
  - 如果只有一个图片变量但需要两种用途，选择图标用途，背景用 CSS 渐变替代
- **相似图片必须全部使用**：如果可用图片列表中有一组编号相似的变量（如 img11、img12、img13...img18 或 imgImage11、imgImage12...），这些几乎一定是同一组件中重复结构的不同实例（如合作伙伴 Logo、卡片封面等）。**必须为每个实例使用不同的变量**，严禁只用第一个而忽略其余
- **严禁使用占位文字替代可用图片**：如果列表中有对应图片变量，绝不能用 \`<div className="text-gray-400">占位文字</div>\` 代替 \`<img src={imgXxx} />\`

### 4. 语义化 HTML
- **导航栏** → \`<nav>\`
- **页面区块** → \`<section>\`
- **页头** → \`<header>\`
- **页脚** → \`<footer>\`
- **按钮**（⚠️ 关键）：
  ❌ \`<div class="relative"><div class="bg-gradient-..."/><p class="absolute inset-0">文字</p></div>\`
  ✅ \`<button class="bg-gradient-to-r from-[#2461ff] to-[#5e7aff] text-white px-6 py-2 rounded-lg">文字</button>\`
  - 所有可点击元素必须使用 \`<button>\` 或 \`<a>\`，绝不用 div + absolute 文字覆盖
- **链接** → \`<a href="#" class="hover:text-blue-600 transition-colors">\`

### 5. 字体处理（⚠️ Figma 格式转换）
- Figma 格式 \`font-['MiSans:Medium',sans-serif]\` 必须转换为标准 CSS：
  - \`MiSans:Regular\` → \`font-sans font-normal\`
  - \`MiSans:Medium\` → \`font-sans font-medium\`
  - \`MiSans:Semibold\` → \`font-sans font-semibold\`
  - \`MiSans:Bold\` → \`font-sans font-bold\`
  - \`Arial:Regular\` → \`font-sans\`
- 不要在 className 中使用 \`font-['...']]\` 自定义字体语法

### 6. 图片资源（⚠️ 极其重要，违反会导致运行时崩溃）
- 图片变量必须从 "../assets" 引入：\`import { imgXxx } from "../assets";\`
- 不要硬编码 URL，不要用 props 传入
- 只 import 实际使用的变量
- **严禁使用未在下方「可用图片变量列表」中列出的变量名**
- **严禁自行编造语义化变量名**（如 imgValuePropBg、imgHeroBg 等），只能使用列表中给出的精确变量名
- **严禁简化变量名**（如不能将 imgImage11 简写为 img11），必须使用列表给出的完整变量名
- **严禁使用 data: URL**：如果原始代码中有 \`data:image/svg+xml,...\` 或类似的内联 data URL，必须删除。只使用 \`imgXxx\` 变量，绝不保留任何 \`data:\` 开头的字符串
- **对象属性名必须是普通字符串**：定义数组/对象时，属性名只能是简单的单词如 \`src\`、\`id\`、\`alt\`，严禁把 URL 作为属性名
- 如果某个位置需要图片但列表中没有合适的，使用列表中已有的最相似的变量作为替代，并加注释说明

### 7. 代码清洁
- **移除所有 Figma 属性**：\`data-node-id\`、\`data-name\` 等
- **移除 Figma 内联样式百分比坐标**：\`style={{ top: '28.52%', left: '35.31%' }}\`
- 保持 TypeScript 类型安全
- 不需要显式 import React
- **严禁创建灰色占位块**：绝对不要用 \`<div className="bg-gray-200 rounded" />\` 或 \`<div className="bg-gray-100 ..." />\` 作为图片占位符。如果某个位置需要图片但没有合适的图片变量，直接省略该图片元素，不要补占位

### 8. 交互与响应式
- 按钮添加 \`hover:brightness-110 transition-all duration-200\`
- 链接添加 \`hover:text-blue-600 transition-colors\`
- 使用响应式断点：\`sm:\`、\`md:\`、\`lg:\`
- 小屏幕自适应：\`hidden md:block\` 隐藏次要元素

### 9. 文本保留
- 保留所有文本内容，不要删除或修改文案

### 10. Import 规范（⚠️ 严格遵守，违反会导致运行时崩溃）
- **辅助组件必须使用 default import**: \`import XxxComponent from "./XxxComponent"\`
- **严禁对辅助组件使用 named import**: \`import { XxxComponent } from "./XxxComponent"\` ← 这会导致 undefined 运行时错误！
- **图片资源使用 named import**: \`import { imgXxx } from "../assets"\`（这是唯一使用 named import 的场景）
- 简单判断规则：从 \`"../assets"\` 导入用 \`{ }\`，从 \`"./组件名"\` 导入**不用** \`{ }\`

## 输出要求

- 只输出纯 TSX 代码，不要 markdown 代码块包裹
- 使用 \`export default function 组件名()\` 格式
- import 语句放在文件顶部
- 组件返回的根元素应该是宽度自适应的 \`<section>\`（语义化标签）`;
}

/**
 * 生成单个组件的 Human Prompt
 */
export function getComponentGenHumanPrompt(params: {
  componentName: string;
  description: string;
  sectionJsx: string;
  backgroundJsx: string | null;
  globalAssets: Array<{ variableName: string; url: string }>;
  usedAssets: string[];
  helperComponents: Array<{ name: string; rawCode: string }>;
}): string {
  const {
    componentName,
    description,
    sectionJsx,
    backgroundJsx,
    globalAssets,
    usedAssets,
    helperComponents,
  } = params;

  let prompt = `请将以下原始 JSX 片段重构为 \`${componentName}\` 组件。

组件描述: ${description}
文件路径: components/${componentName}.tsx

`;

  // 添加图片资源上下文
  if (usedAssets.length > 0) {
    const relevantAssets = globalAssets.filter((a) => usedAssets.includes(a.variableName));
    if (relevantAssets.length > 0) {
      // 按格式分类，帮助 AI 理解每个变量的适用场景
      const svgAssets = relevantAssets.filter((a) => a.url.endsWith(".svg"));
      const rasterAssets = relevantAssets.filter((a) => !a.url.endsWith(".svg"));

      prompt += `## 可用图片变量列表（⚠️ 严格限制，只能使用以下变量名）

该 section 引用了以下图片变量（请在文件顶部从 "../assets" import 它们）:
`;
      if (rasterAssets.length > 0) {
        prompt += `\nPNG/JPG 图片（适合做背景、封面、照片展示）:\n`;
        prompt += rasterAssets.map((a) => `  - ${a.variableName}`).join("\n");
      }
      if (svgAssets.length > 0) {
        prompt += `\nSVG 图片（适合做图标、小型装饰，不适合做全宽背景）:\n`;
        prompt += svgAssets.map((a) => `  - ${a.variableName}`).join("\n");
      }

      prompt += `\n\n示例 import 语句:
import { ${relevantAssets.map((a) => a.variableName).join(", ")} } from "../assets";

⚠️ 严禁使用上述列表之外的任何 img 变量！如果你使用了列表中不存在的变量名，代码会在运行时崩溃。
⚠️ 列表中的每个图片变量只能用于一个位置，不要重复使用同一个变量！如果列表中有多个编号相似的变量（如 img11、img12、img13），请为组件中的每个实例分别使用不同的变量。

`;
    }
  } else if (globalAssets.length > 0) {
    // 即使 usedAssets 为空，也提供全量列表供 AI 参考
    prompt += `## 可用图片变量列表（⚠️ 严格限制，只能使用以下变量名）

所有可用的图片变量:
${globalAssets.map((a) => `  - ${a.variableName}`).join("\n")}

⚠️ 如果需要使用图片，只能从上述列表中选择。严禁使用列表之外的任何 img 变量！

`;
  }

  // 添加辅助组件上下文（仅在 JSX 中实际引用时才 import）
  if (helperComponents.length > 0) {
    prompt += `项目中有以下辅助组件可用，仅在原始 JSX 中出现了对应标签（如 <${helperComponents[0].name} />）时才 import，否则不要引入:
${helperComponents.map((c) => `  - ${c.name} → 必须使用 default import: import ${c.name} from "./${c.name}"`).join("\n")}

⚠️ 严禁使用 named import（大括号）导入辅助组件！以下写法会导致运行时崩溃：
${helperComponents.map((c) => `  ❌ import { ${c.name} } from "./${c.name}"  ← 错误！`).join("\n")}
${helperComponents.map((c) => `  ✅ import ${c.name} from "./${c.name}"  ← 正确！`).join("\n")}

`;
  }

  // 添加背景元素
  if (backgroundJsx) {
    prompt += `## 背景元素（⚠️ 需要判断是否适合当前区域）

该区域有背景元素。**在使用前，请先检查**：
1. 观察下方「原始 JSX 代码」中文字的颜色：
   - 如果文字是深色（如 text-[#030a2a]）→ 需要浅色/明亮背景
   - 如果文字是浅色（如 text-white）→ 可以使用深色背景
2. 判断背景图是深色还是浅色：
   - 深色背景图：通常是科技风、星空、宇宙、深蓝色调
   - 浅色背景图：通常是波浪、渐变、淡蓝白色调
3. **如果背景图与文字颜色冲突（深色背景+深色文字），有两个选择**：
   - 选择 A：不使用该背景图，改用 CSS 渐变（推荐：\`bg-gradient-to-b from-white to-blue-100\`）
   - 选择 B：使用背景图，但将所有文字改为 \`text-white\`

处理方式：
- 如果决定使用背景图：\`<div className="absolute inset-0 overflow-hidden pointer-events-none"><img ... /></div>\`
- 内容层必须有 \`relative z-10\`

背景原始代码:
\`\`\`tsx
${backgroundJsx}
\`\`\`

`;
  }

  // 主要 JSX 内容
  prompt += `原始 JSX 代码片段（注意：这些代码使用的是全局 absolute 坐标，你必须分析元素之间的视觉关系并用 flex/grid 重建布局）:
\`\`\`tsx
${sectionJsx}
\`\`\`

## ⚠️ 重构检查清单（逐项核对）

### 布局（最常见的错误）
- [ ] 移除了所有 \`top-[Npx]\` \`left-[Npx]\` \`right-[Npx]\` \`bottom-[Npx]\`
- [ ] 移除了 \`w-[1920px]\` 等画布尺寸，使用 \`w-full\`
- [ ] 移除了 \`h-[1218px]\` \`min-h-[900px]\` 等固定大高度
- [ ] 组件根元素使用 \`<section className="relative w-full ...">\`
- [ ] 内容区域使用 \`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\`
- [ ] 元素间用 flex/grid + gap 布局，不用 absolute

### 背景与文字协调（最容易出错）
- [ ] 检查了原始 JSX 中文字的颜色
- [ ] 如果文字是深色，确认使用的是浅色背景（或 CSS 渐变）
- [ ] 如果使用深色背景图，已将文字改为 \`text-white\`
- [ ] 没有出现「深色背景 + 深色文字」的情况

### 常见 Figma 反模式修复
- [ ] \`<div>背景</div> + <div class="absolute">文字</div>\` → \`<button class="bg-...">文字</button>\`
- [ ] \`<div class="overflow-hidden"><img class="absolute h-[254%] left-[-125%]">\` → \`<img class="w-full h-auto object-cover">\`
- [ ] \`font-['MiSans:Medium',sans-serif]\` → \`font-sans font-medium\`
- [ ] 移除所有 \`data-node-id\`、\`data-name\` 属性
- [ ] 移除所有 \`style={{ top: '28%', left: '35%' }}\` 百分比定位
- [ ] 小数像素 \`h-[55.645px]\` → 四舍五入为 Tailwind 标准值 \`h-14\`

请生成完整的 ${componentName}.tsx 文件代码。`;

  return prompt;
}
