// step3: UI分析
import { z } from "zod/v4";

// 组件类型枚举 (基于 Radix UI / Shadcn UI 能力集)
const ComponentTypeEnum = z.enum([
  // Layout & Containers
  "Layout", // 布局容器
  "Card",
  "Sheet", // 侧边抽屉 (对应 Radix Dialog/Sheet)
  "Dialog", // 模态框
  "ScrollArea", // 滚动区域
  "ResizablePanel", // 可调整大小面板 (react-resizable-panels)
  "Accordion", // 手风琴 (radix-accordion)
  "Collapsible", // 可折叠区域 (radix-collapsible)
  "Separator", // 分割线
  "AspectRatio", // 宽高比容器

  // Navigation
  "Navbar",
  "Sidebar",
  "NavigationMenu", // 导航菜单 (radix-navigation-menu)
  "Tabs", // 选项卡 (radix-tabs)
  "Breadcrumb",
  "Menubar", // 菜单栏 (radix-menubar)
  "DropdownMenu", // 下拉菜单 (radix-dropdown-menu)

  // Data Display
  "Table",
  "List",
  "Grid",
  "Avatar", // 头像 (radix-avatar)
  "Badge", // (通常配合 shadcn 使用)
  "Carousel", // 轮播 (embla-carousel)
  "Chart", // 图表 (recharts)
  "HoverCard", // 悬停卡片 (radix-hover-card)
  "Tooltip", // 提示 (radix-tooltip)
  "Popover", // 气泡卡片 (radix-popover)

  // Form & Interaction
  "Form",
  "Button",
  "Input",
  "Textarea",
  "Select", // 下拉选择 (radix-select)
  "Checkbox", // 复选框 (radix-checkbox)
  "RadioGroup", // 单选组 (radix-radio-group)
  "Switch", // 开关 (radix-switch)
  "Slider", // 滑块 (radix-slider)
  "Toggle", // 切换按钮 (radix-toggle)
  "ToggleGroup", // 切换组 (radix-toggle-group)
  "DatePicker", // 日期选择 (react-day-picker)
  "InputOTP", // 验证码输入 (input-otp)
  "Label", // 标签
  "Toolbar", // 工具栏
  "Editor", // 编辑器区域

  // Feedback
  "Alert", // 警告框
  "AlertDialog", // 确认对话框 (radix-alert-dialog)
  "Progress", // 进度条 (radix-progress)
  "Skeleton", // 骨架屏
  "Toaster", // 消息提示 (sonner)
  "ContextMenu", // 右键菜单 (radix-context-menu)
]);

const UIComponentSchema = z.object({
  id: z.string().describe("组件ID (PascalCase)"),
  type: ComponentTypeEnum.describe("组件类型"),
  label: z.string().describe("组件显示的标题/标签 (中文)"),
  // 绑定关系
  bindDataModel: z.string().describe("绑定的数据模型ID (对应 Capability.dataModels)"),
  bindBehavior: z.array(z.string()).describe("绑定的交互行为ID (对应 Capability.behaviors)"),
});

const UISectionSchema = z.object({
  sectionId: z.string().describe("区块ID (如 header, content, sidebar)"),
  role: z
    .enum(["navigation", "filter", "list", "detail", "editor", "dashboard", "form"])
    .describe("区块的功能角色"),
  layout: z.enum(["flex-row", "flex-col", "grid", "single"]).describe("区块内部布局方向"),
  title: z.string().describe("区块标题"),
  components: z.array(UIComponentSchema).describe("区块内包含的组件"),
});

const UIPageSchema = z.object({
  pageId: z.string().describe("对应Capability中的PageID"),
  route: z.string().describe("Next.js 路由路径 (例如 /articles/[id], /dashboard)"),
  description: z.string().describe("页面视觉/功能描述"),
  layout: z
    .enum([
      "default", // 默认布局 (Navbar + Footer)
      "dashboard-shell", // 后台布局 (Sidebar + Navbar)
      "blank", // 空白布局 (如登录页)
      "editor-shell", // 编辑器布局 (全屏无滚动)
    ])
    .describe("页面整体Layout骨架"),
  sections: z.array(UISectionSchema).describe("页面包含的主要区块"),
});

export const UISchema = z.object({
  pages: z.array(UIPageSchema).describe("应用的所有页面结构设计"),
  themeStrategy: z.string().describe("基于设计稿分析的主题策略建议 (如 '现代化暗色风格')"),
});

export type UI = z.infer<typeof UISchema>;
