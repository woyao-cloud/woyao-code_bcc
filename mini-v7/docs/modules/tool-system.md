# 工具系统设计文档

## 概述

工具系统提供 15+ 内置工具，让 AI 助手能够与系统交互、操作文件、执行命令等。工具系统设计为可扩展的，支持通过 MCP 添加自定义工具。

**文件位置**: `src/tools/`

---

## 系统架构

```
工具系统
├── 工具注册表 (tools.ts)
│   ├── 工具注册
│   ├── 工具查找
│   └── MCP 工具集成
├── 工具接口 (Tool.ts)
│   ├── Tool 接口
│   ├── ToolUseContext
│   └── ToolResult
└── 内置工具 (tools/builtin/)
    ├── 文件操作工具
    ├── 搜索工具
    ├── 系统工具
    ├── 网络工具
    ├── 任务工具
    ├── 补丁工具
    ├── Skill 工具
    └── 计划模式工具
```

---

## 工具接口 (Tool.ts)

### Tool 接口

```typescript
interface Tool {
  name: string
  description: string
  inputSchema: ToolInputSchema
  prompt: string

  execute(
    context: ToolUseContext,
    input: Record<string, unknown>
  ): Promise<ToolResult>

  canUse?(
    context: ToolUseContext,
    input: Record<string, unknown>
  ): Promise<PermissionResult>

  userFacingName?(): string
}
```

### ToolInputSchema

```typescript
interface ToolInputSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}
```

### ToolUseContext

```typescript
interface ToolUseContext {
  toolUse: ToolUseBlockParam
  permissionMode: PermissionMode
  toolPermissionContext: ToolPermissionContext
  cwd: string
  abortSignal: AbortSignal
  messages: Message[]
  isInteractive: boolean
}
```

### ToolResult

```typescript
interface ToolResult {
  content: string
  rendered?: string
  success: boolean
  error?: string
  metadata?: Record<string, unknown>
}
```

---

## 内置工具列表

| 工具名称 | 描述 | 危险工具 |
|---------|------|---------|
| Bash | 执行系统命令 | ✅ |
| Read | 读取文件内容 | ❌ |
| Write | 写入文件 | ✅ |
| Edit | 编辑文件 | ✅ |
| Grep | 搜索文件内容 | ❌ |
| Glob | 查找文件 | ❌ |
| WebFetch | 抓取网页 | ✅ |
| WebSearch | 搜索网页 | ❌ |
| TaskCreate | 创建任务 | ❌ |
| TaskList | 列出任务 | ❌ |
| TaskUpdate | 更新任务 | ❌ |
| ApplyPatch | 应用补丁 | ✅ |
| Skill | 管理 Skills | ❌ |
| EnterPlanMode | 进入计划模式 | ❌ |
| ExitPlanMode | 退出计划模式 | ❌ |

---

## 文件操作工具

### Read (FileReadTool)

读取文件内容。

**输入**:
```typescript
{
  file_path: string
  offset?: number    // 行偏移
  limit?: number     // 行数限制
}
```

**输出**: 文件内容，带行号

### Write (FileWriteTool)

写入文件，创建或覆盖。

**输入**:
```typescript
{
  file_path: string
  content: string
}
```

**输出**: 创建/更新确认，包含行数和字符数

**特性**:
- 自动创建父目录
- 支持绝对和相对路径

### Edit (FileEditTool)

编辑文件内容，支持替换。

**输入**:
```typescript
{
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}
```

**输出**: 编辑确认或错误

**特性**:
- 精确匹配 `old_string`
- 歧义检测：多个匹配时拒绝执行
- 支持 `replace_all` 替换所有

---

## 搜索工具

### Grep (GrepTool)

使用正则表达式搜索文件内容。

**输入**:
```typescript
{
  pattern: string      // 正则表达式
  path?: string        // 搜索路径
  include?: string     // 文件 glob 过滤
}
```

**输出**: 匹配结果，包含文件路径、行号、内容

### Glob (GlobTool)

查找文件，支持 glob 模式。

**输入**:
```typescript
{
  pattern: string      // glob 模式
  path?: string        // 搜索路径
}
```

**输出**: 匹配的文件列表

---

## 系统工具

### Bash (BashTool)

执行系统命令。

**输入**:
```typescript
{
  command: string     // 要执行的命令
  args?: string[]     // 参数
  cwd?: string        // 工作目录
}
```

**输出**: 命令输出 (stdout + stderr)

**特性**:
- 安全执行
- 超时保护
- 输出截断

---

## 网络工具

### WebFetch (WebFetchTool)

抓取网页内容。

**输入**:
```typescript
{
  url: string
}
```

**输出**: 网页内容 (转换为 Markdown)

### WebSearch (WebSearchTool)

搜索网页。

**输入**:
```typescript
{
  query: string
  num?: number        // 结果数量
}
```

**输出**: 搜索结果列表

---

## 任务工具

### TaskCreate (TaskCreateTool)

创建新任务。

**输入**:
```typescript
{
  title: string
  description: string
}
```

**输出**: 任务创建确认

### TaskList (TaskListTool)

列出所有任务。

**输入**: 无

**输出**: 任务列表，带状态

### TaskUpdate (TaskUpdateTool)

更新任务状态。

**输入**:
```typescript
{
  id: string
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  result?: string
}
```

**输出**: 任务更新确认

---

## 补丁工具

### ApplyPatch (ApplyPatchTool)

应用统一差异格式的补丁。

**输入**:
```typescript
{
  file_path: string
  patch: string       // unified diff 格式
}
```

**输出**: 应用确认或错误

---

## Skill 工具

### Skill (SkillTool)

管理和查看 Skills。

**输入**:
```typescript
{
  command: 'list' | 'view'
  name?: string       // view 命令需要
}
```

**输出**: Skill 列表或单个 Skill 内容

---

## 计划模式工具

### EnterPlanMode (EnterPlanModeTool)

进入计划模式。

**输入**: 无

**输出**: 确认进入计划模式

### ExitPlanMode (ExitPlanModeTool)

退出计划模式。

**输入**: 无

**输出**: 确认退出计划模式

---

## MCP 工具集成

### MCP 工具包装器

通过 MCP (Model Context Protocol) 可以添加自定义工具。

```typescript
// src/tools/builtin/MCPTool/MCPTool.ts

function createMCPToolWrapper(mcpEntry: MCPEntry, tool: MCPTool): Tool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    prompt: `MCP tool: ${tool.name}`,
    async execute(ctx, input) {
      // 调用 MCP 服务器
    }
  }
}
```

### 注册 MCP 工具

```typescript
// src/tools/tools.ts

export function registerMCPTools(entries: MCPEntry[]): void {
  mcpTools = []
  for (const entry of entries) {
    for (const tool of entry.tools) {
      mcpTools.push(createMCPToolWrapper(entry, tool))
    }
  }
}
```

---

## 工具注册表 (tools.ts)

### 获取工具列表

```typescript
export function getTools(): Tool[] {
  return [
    BashTool,
    FileReadTool,
    FileWriteTool,
    FileEditTool,
    GrepTool,
    GlobTool,
    WebFetchTool,
    WebSearchTool,
    TaskCreateTool,
    TaskListTool,
    TaskUpdateTool,
    ApplyPatchTool,
    SkillTool,
    EnterPlanModeTool,
    ExitPlanModeTool,
    ...mcpTools
  ]
}
```

### 获取工具 Map

```typescript
export function getToolsMap(): Tools {
  const map = new Map<string, Tool>()
  for (const tool of getTools()) map.set(tool.name, tool)
  return map
}
```

---

## 工具执行流程

```
工具调用请求
    ↓
查找工具 (getToolsMap)
    ↓
权限检查 (permissionManager)
    ↓
构建上下文 (ToolUseContext)
    ↓
执行工具 (tool.execute)
    ↓
处理结果
    ├── 成功 → 正常响应
    └── 失败 → 错误信息
    ↓
添加到对话历史
```

---

## 添加新工具

### 步骤

1. **创建工具文件**
   ```
   src/tools/builtin/MyTool/MyTool.ts
   ```

2. **实现 Tool 接口**
   ```typescript
   export const MyTool: Tool = {
     name: 'MyTool',
     description: 'Description',
     inputSchema: {
       type: 'object',
       properties: {
         param: { type: 'string' }
       },
       required: ['param']
     },
     prompt: 'My tool prompt',
     async execute(ctx, input) {
       // 实现
       return { success: true, content: 'Result' }
     },
     userFacingName: () => 'MyTool'
   }
   ```

3. **注册工具**
   在 `src/tools/tools.ts` 中添加到 `getTools()` 列表

4. **添加测试**
   在 `src/__tests__/` 中添加测试文件

### 最佳实践

1. **清晰的描述**: 准确说明工具功能
2. **完整的 Schema**: 定义所有参数和类型
3. **错误处理**: 优雅处理各种错误情况
4. **用户友好**: 输出易于理解的结果
5. **安全第一**: 危险工具需要权限检查

---

## 测试覆盖

- `fileTools.test.ts`: 文件工具测试
- `grepGlobTools.test.ts`: 搜索工具测试
- `toolsRegistry.test.ts`: 工具注册表测试
- `bashTool.test.ts`: Bash 工具测试
- `mcpTool.test.ts`: MCP 工具测试

---

## 设计模式

### 策略模式

每个工具实现相同的接口，可以互换使用。

### 工厂模式

`createMCPToolWrapper` 动态创建工具包装器。

### 注册表模式

`getTools()` 和 `getToolsMap()` 提供工具注册和查找。

---

## 安全考虑

1. **权限检查**: 危险工具需要用户授权
2. **输入验证**: 验证所有输入参数
3. **路径处理**: 正确处理相对/绝对路径
4. **命令执行**: 安全地执行系统命令
5. **网络访问**: 限制网络访问范围

---

## 性能考虑

1. **流式输出**: 大文件流式处理
2. **并行执行**: 多个工具可以并行执行
3. **缓存**: 重复操作结果缓存
4. **超时**: 长时间操作设置超时

---

## 扩展点

1. **更多内置工具**: 添加新的内置工具
2. **MCP 服务器**: 通过 MCP 添加自定义工具
3. **工具组合**: 支持工具链式调用
4. **工具宏**: 记录和重放工具序列
5. **工具模板**: 参数化工具模板
