/**
 * Section 命名 Prompt
 *
 * 轻量级 AI 任务：根据每个 section 的文本内容和结构信息，
 * 给出语义化的组件名称。
 */

/**
 * 生成 Section 命名的 System Prompt
 */
export function getSectionNamingSystemPrompt(): string {
  return `你是一个前端组件命名专家。你的任务是为网页的各个区域（section）起一个语义化的 React 组件名称。

命名规则：
1. 使用 PascalCase 风格（如 HeroSection, FeatureGrid, FooterNav）
2. 名称应反映该区域的功能或内容（如包含导航就叫 Navigation，包含英雄横幅就叫 HeroBanner）
3. 名称应简洁，通常 1-3 个单词
4. 避免使用 Section1, Section2 等无意义编号
5. 如果内容无法判断功能，可以根据位置命名（如 TopBanner, MiddleContent, BottomArea）
6. **每个名称必须全局唯一**，不允许两个 section 使用相同的 componentName。如果有多个功能相似的区域（如两排卡片），请用不同的名称区分它们（如 SolutionCardRow1 / SolutionCardRow2，或 PrimarySolutions / SecondarySolutions）

常见命名参考：
- 导航区: Navbar, Navigation, TopNav
- 主横幅: HeroBanner, HeroSection
- 特性展示: FeatureGrid, FeatureList, Features
- 内容区: ContentArea, MainContent, ArticleSection
- 卡片区: CardGrid, CardSection, ProductCards
- 统计区: StatsSection, NumbersSection
- 表单区: ContactForm, SignupForm
- 页脚: Footer, FooterNav
- 侧边栏: Sidebar, SidePanel
- CTA 区: CTASection, CallToAction`;
}

/**
 * 生成 Section 命名的 Human Prompt
 */
export function getSectionNamingHumanPrompt(
  sectionsInfo: Array<{
    index: number;
    totalBlocks: number;
    topRange: { min: number; max: number };
    allTexts: string[];
    allAssets: string[];
    hasBackground: boolean;
  }>,
): string {
  const sectionsDesc = sectionsInfo
    .map((s) => {
      const texts =
        s.allTexts.length > 0
          ? `文本内容: [${s.allTexts.slice(0, 8).join(", ")}${s.allTexts.length > 8 ? "..." : ""}]`
          : "无文本内容";
      const assets = s.allAssets.length > 0 ? `引用图片: ${s.allAssets.length} 个` : "无图片";
      const bg = s.hasBackground ? "有背景" : "无背景";

      return `Section ${s.index}:
  - 元素数量: ${s.totalBlocks}
  - Y轴范围: ${s.topRange.min}px ~ ${s.topRange.max}px
  - ${texts}
  - ${assets}
  - ${bg}`;
    })
    .join("\n\n");

  return `请为以下 ${sectionsInfo.length} 个页面区域命名。
每个区域按 Y 轴位置从上到下排列：

${sectionsDesc}

请为每个 section 返回 componentName（PascalCase 组件名）、description（简短描述）和 fileName（文件名，不含扩展名）。`;
}
