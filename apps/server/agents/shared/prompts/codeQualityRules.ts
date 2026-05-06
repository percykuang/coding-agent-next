/**
 * 代码质量规则提示词片段
 * 用于确保生成的代码具有防御性编程能力，避免运行时错误
 */

/**
 * 空值保护规则 - 用于 Hooks 和组件生成
 * 解决 "Cannot read properties of null/undefined" 类错误
 */
export const NULL_SAFETY_RULES = `
【空值保护规则 - 必须严格遵守】
生成的代码必须具备防御性编程能力，防止因 null/undefined 导致的运行时错误。

1. **可选链操作符 (?.)**: 访问可能为空的对象属性时必须使用
   - ✅ 正确: \`user?.name\`, \`data?.items?.length\`
   - ❌ 错误: \`user.name\`, \`data.items.length\`

2. **空值合并操作符 (??)**: 提供默认值时使用
   - ✅ 正确: \`const name = user?.name ?? '未知用户'\`
   - ✅ 正确: \`const items = data?.list ?? []\`
   - ❌ 错误: \`const name = user.name || '未知用户'\` (空字符串会被误判)

3. **数组方法调用前必须确保是数组**:
   - ✅ 正确: \`(items ?? []).map(...)\`
   - ✅ 正确: \`Array.isArray(items) && items.map(...)\`
   - ✅ 正确: \`items?.map(...) ?? []\`
   - ❌ 错误: \`items.map(...)\` (items 可能是 undefined)

4. **字符串方法调用前必须确保是字符串**:
   - ✅ 正确: \`(str ?? '').match(...)\`
   - ✅ 正确: \`str?.includes?.('keyword') ?? false\`
   - ✅ 正确: \`typeof str === 'string' && str.match(...)\`
   - ❌ 错误: \`str.match(...)\`, \`str.split(...)\` (str 可能是 null)

5. **Hook 返回值处理**:
   - Hooks 返回的 data 在 loading 时通常是 undefined
   - ✅ 正确: \`const items = data ?? []\`
   - ✅ 正确: \`if (loading || !data) return <Loading />\`
   - ❌ 错误: \`data.length\` (data 可能还未加载)

6. **渲染前的空值检查**:
   - ✅ 正确: \`{items?.length > 0 && items.map(...)}\`
   - ✅ 正确: \`{items?.length ? <List items={items} /> : <Empty />}\`
   - ❌ 错误: \`{items.map(...)}\` (items 可能未定义)
`;

/**
 * Mock 数据质量规则 - 确保生成的数据不会导致运行时错误
 */
export const MOCK_DATA_RULES = `
【Mock 数据完整性规则 - 防止空值错误】
生成的 Mock 数据必须是完整的、可直接使用的，不能包含会导致运行时错误的空值。

1. **所有字段必须有有效值**:
   - ✅ 正确: \`title: '探索宇宙的奥秘'\`
   - ❌ 错误: \`title: ''\`, \`title: null\`, 缺少 title 字段

2. **数组字段必须是数组，不能为空数组（除非业务逻辑允许）**:
   - ✅ 正确: \`tags: ['科幻', '冒险', '热血']\`
   - ❌ 错误: \`tags: []\`, \`tags: null\`

3. **嵌套对象必须完整**:
   - ✅ 正确: \`author: { id: 'u001', name: '张三', avatar: 'https://...' }\`
   - ❌ 错误: \`author: {}\`, \`author: null\`, \`author: { id: 'u001' }\` (缺少必要字段)

4. **ID 字段规范**:
   - ✅ 正确: \`id: 'novel_001'\`, \`userId: 'user_abc123'\`
   - ❌ 错误: \`id: ''\`, \`id: null\`

5. **图片 URL 必须有效**:
   - ✅ 正确: \`avatar: 'https://images.unsplash.com/photo-xxx?w=200'\`
   - ❌ 错误: \`avatar: ''\`, \`avatar: '/placeholder.jpg'\` (相对路径可能无效)

6. **数值字段必须是合理的数字**:
   - ✅ 正确: \`viewCount: 1234\`, \`rating: 4.5\`
   - ❌ 错误: \`viewCount: 0\` (除非业务上确实是 0), \`rating: null\`

7. **日期字段必须是有效的 ISO 字符串**:
   - ✅ 正确: \`createdAt: '2024-01-15T10:30:00Z'\`
   - ❌ 错误: \`createdAt: ''\`, \`createdAt: 'invalid-date'\`
`;

/**
 * 组件防御性渲染规则
 */
export const DEFENSIVE_RENDERING_RULES = `
【组件防御性渲染规则 - 优雅处理边缘情况】
组件必须能够优雅地处理各种边缘情况，而不是崩溃。

1. **三态处理模式**: 每个数据获取组件必须处理三种状态
   \`\`\`tsx
   function DataList() {
     const { data, loading, error } = useData();
     
     // 状态 1: 加载中
     if (loading) return <div className="animate-pulse">加载中...</div>;
     
     // 状态 2: 错误
     if (error) return <div className="text-red-500">加载失败: {error}</div>;
     
     // 状态 3: 空数据
     if (!data?.length) return <div className="text-gray-500">暂无数据</div>;
     
     // 正常渲染
     return <ul>{data.map(item => <li key={item.id}>{item.name}</li>)}</ul>;
   }
   \`\`\`

2. **详情页空值保护**:
   \`\`\`tsx
   function Detail({ id }: { id: string }) {
     const { data: item, loading, error } = useItem(id);
     
     if (loading) return <Skeleton />;
     if (error) return <ErrorMessage message={error} />;
     if (!item) return <NotFound message="未找到该项目" />;
     
     // 安全渲染
     return (
       <div>
         <h1>{item.title ?? '无标题'}</h1>
         <p>{item.description ?? '暂无描述'}</p>
         <span>{item.author?.name ?? '匿名'}</span>
       </div>
     );
   }
   \`\`\`

3. **列表渲染安全模式**:
   \`\`\`tsx
   // ✅ 正确: 使用空值合并 + 安全访问
   const items = data ?? [];
   return (
     <ul>
       {items.map(item => (
         <li key={item?.id ?? Math.random()}>
           {item?.title ?? '未命名'}
         </li>
       ))}
     </ul>
   );
   
   // ❌ 错误: 直接访问可能为空的数据
   return <ul>{data.map(item => <li>{item.title}</li>)}</ul>;
   \`\`\`

4. **图片加载失败处理**:
   \`\`\`tsx
   <img 
     src={item?.image ?? '/fallback.png'} 
     alt={item?.title ?? '图片'}
     onError={(e) => { e.currentTarget.src = '/fallback.png'; }}
   />
   \`\`\`

5. **条件渲染优先级**: 始终先检查数据可用性
   \`\`\`tsx
   // ✅ 正确
   {items?.length > 0 ? (
     <ItemList items={items} />
   ) : (
     <EmptyState />
   )}
   
   // ❌ 错误
   {items.length > 0 ? <ItemList items={items} /> : <EmptyState />}
   \`\`\`
`;

/**
 * 字符串字面量安全规则
 * 解决 LLM 生成代码时转义字符被拆行导致 SyntaxError 的问题
 */
export const STRING_LITERAL_RULES = `
【字符串字面量安全规则 - 防止语法错误】
生成代码时，字符串中的特殊字符处理必须安全，避免产生语法错误。

1. **禁止在字符串中使用 \\n 作为断行符**，改用正则或 template literal:
   - ✅ 正确: \`text.split(/\\n/)\`
   - ✅ 正确: \`text.split(String.fromCharCode(10))\`
   - ❌ 错误: \`text.split('\\n')\` (可能被序列化时拆成真换行，导致 Unterminated string)

2. **正则表达式优于字符串字面量** 做文本分割/替换:
   - ✅ 正确: \`content.replace(/\\n\\n/g, '<br/><br/>')\`
   - ✅ 正确: \`content.split(/\\n+/)\`
   - ❌ 错误: \`content.replace('\\n\\n', '<br/><br/>')\`
   - ❌ 错误: \`content.split('\\n')\`

3. **段落处理推荐模式**:
   \`\`\`tsx
   // ✅ 推荐: 用正则按段落分割
   {content.split(/\\n+/).map((paragraph, i) => (
     <p key={i}>{paragraph}</p>
   ))}
   \`\`\`
`;

/**
 * 组合所有代码质量规则
 */
export const CODE_QUALITY_RULES = `
${NULL_SAFETY_RULES}

${DEFENSIVE_RENDERING_RULES}

${STRING_LITERAL_RULES}
`;

/**
 * 将代码质量规则追加到现有 System Prompt
 */
export const appendCodeQualityRules = (prompt: string): string => {
  return `${prompt}\n${CODE_QUALITY_RULES}`;
};

/**
 * 将 Mock 数据规则追加到现有 System Prompt
 */
export const appendMockDataRules = (prompt: string): string => {
  return `${prompt}\n${MOCK_DATA_RULES}`;
};
