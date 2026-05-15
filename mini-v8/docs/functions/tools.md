# 工具系统详解

## 概述

工具系统是 mini-v8 的核心交互能力，允许 AI 模型通过调用工具与外部世界进行交互。工具系统采用插件化设计，支持动态注册和扩展。

---

## 一、工具接口定义

### 1.1 核心接口

```typescript
export interface Tool {
  /** 工具唯一名称，用于模型调用 */
  name: string
  
  /** 工具描述，提供给模型理解工具用途 */
  description: string
  
  /** 输入参数的 JSON Schema 定义 */
  inputSchema: ToolInputSchema
  
  /** 使用提示，指导模型如何正确使用工具 */
  prompt: string
  
  /**
   * 执行工具的核心方法
   * @param context 工具使用上下文
   * @param input 用户输入参数
   * @returns 工具执行结果
   */
  execute(
    context: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<ToolResult>
  
  /**
   * 可选的权限检查方法
   * @returns 'allow' | 'deny' | 'prompt'
   */
  canUse?(
    context: ToolUseContext,
    input: Record<string, unknown>,
  ): Promise<PermissionResult>
  
  /** 显示给用户的友好名称 */
  userFacingName?(): string
  
  /** 工具别名，支持多种调用方式 */
  aliases?: string[]
  
  /** 是否需要用户确认执行 */
  requiresConfirmation?: boolean
  
  /** 工具分类 */
  category?: ToolCategory
  
  /** 是否已废弃 */
  deprecated?: boolean
  
  /** 废弃提示信息 */
  deprecationMessage?: string
}
```

### 1.2 上下文接口

```typescript
export interface ToolUseContext {
  toolUse: ToolUseBlockParam      // 当前工具调用块
  permissionMode: PermissionMode  // 权限模式
  toolPermissionContext: ToolPermissionContext  // 权限上下文
  cwd: string                     // 当前工作目录
  abortSignal: AbortSignal        // 取消信号
  messages: Message[]             // 对话消息历史
  isInteractive: boolean          // 是否交互模式
}
```

### 1.3 结果接口

```typescript
export interface ToolResult {
  content: string                 // 返回给模型的内容
  rendered?: string               // 显示给用户的格式化输出
  success: boolean                // 是否成功
  error?: string                  // 错误信息
  metadata?: Record<string, unknown>  // 元数据
}
```

---

## 二、工具工厂函数

### 2.1 buildTool

用于创建类型安全的工具：

```typescript
export function buildTool<Input = Record<string, unknown>, Output = ToolResult>(
  config: ToolConfig<Input, Output>,
): TypedTool<Input, Output> {
  // 验证必填字段
  if (!config.name || !config.name.trim()) {
    throw new Error('Tool name is required')
  }
  if (!config.description || !config.description.trim()) {
    throw new Error('Tool description is required')
  }
  if (!config.inputSchema) {
    throw new Error('Tool inputSchema is required')
  }
  if (!config.execute || typeof config.execute !== 'function') {
    throw new Error('Tool execute function is required')
  }
  
  // 设置默认值并返回工具
  const tool: TypedTool<Input, Output> = {
    name: config.name,
    description: config.description,
    inputSchema: config.inputSchema,
    prompt: config.prompt,
    execute: config.execute,
    canUse: config.canUse,
    userFacingName: config.userFacingName,
    aliases: config.aliases || [],
    requiresConfirmation: config.requiresConfirmation || false,
    category: config.category || 'other',
    deprecated: config.deprecated || false,
    deprecationMessage: config.deprecationMessage,
  }
  return tool
}
```

---

## 三、工具注册机制

### 3.1 全局注册表

```typescript
let globalRegistry: ToolRegistry = new Map()

export function registerTool(tool: Tool, enabled: boolean = true): void {
  globalRegistry.set(tool.name, {
    tool,
    enabled,
    registrationTime: Date.now(),
  })
  
  // 注册别名
  if (tool.aliases) {
    for (const alias of tool.aliases) {
      globalRegistry.set(alias, {
        tool,
        enabled,
        registrationTime: Date.now(),
      })
    }
  }
}
```

### 3.2 注册表结构

| 字段 | 类型 | 说明 |
|------|------|------|
| `tool` | Tool | 工具实例 |
| `enabled` | boolean | 是否启用 |
| `registrationTime` | number | 注册时间戳 |

---

## 四、内置工具详解

### 4.1 文件操作工具

#### FileReadTool

```typescript
{
  name: 'ReadFile',
  description: 'Read the contents of a file',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' }
    },
    required: ['path']
  },
  category: 'file'
}
```

**功能**: 读取指定文件内容

#### FileWriteTool

```typescript
{
  name: 'WriteFile',
  description: 'Write content to a file, creating or overwriting',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
      append: { type: 'boolean', description: 'Append to existing file' }
    },
    required: ['path', 'content']
  },
  category: 'file',
  requiresConfirmation: true
}
```

**功能**: 写入文件内容，支持覆盖和追加模式

#### FileEditTool

```typescript
{
  name: 'EditFile',
  description: 'Edit a file by replacing text ranges',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      edits: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            startLine: { type: 'number' },
            endLine: { type: 'number' },
            newText: { type: 'string' }
          }
        }
      }
    },
    required: ['path', 'edits']
  },
  category: 'file',
  requiresConfirmation: true
}
```

**功能**: 按行范围编辑文件

#### ApplyPatchTool

```typescript
{
  name: 'ApplyPatch',
  description: 'Apply a unified diff patch to a file',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path' },
      patch: { type: 'string', description: 'Unified diff patch' }
    },
    required: ['path', 'patch']
  },
  category: 'file',
  requiresConfirmation: true
}
```

**功能**: 应用 unified diff 补丁

### 4.2 系统操作工具

#### BashTool

```typescript
{
  name: 'Bash',
  description: 'Execute a shell command',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' },
      cwd: { type: 'string', description: 'Working directory' }
    },
    required: ['command']
  },
  category: 'system',
  requiresConfirmation: true
}
```

**功能**: 执行 shell 命令

### 4.3 搜索工具

#### GrepTool

```typescript
{
  name: 'Grep',
  description: 'Search for patterns in files',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern' },
      path: { type: 'string', description: 'Search path' },
      caseInsensitive: { type: 'boolean', description: 'Case insensitive' }
    },
    required: ['pattern']
  },
  category: 'search'
}
```

**功能**: 在文件中搜索文本模式

#### GlobTool

```typescript
{
  name: 'Glob',
  description: 'Find files matching a pattern',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern' },
      path: { type: 'string', description: 'Base path' }
    },
    required: ['pattern']
  },
  category: 'search'
}
```

**功能**: 匹配文件路径模式

### 4.4 网络工具

#### WebFetchTool

```typescript
{
  name: 'WebFetch',
  description: 'Fetch content from a URL',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'URL to fetch' },
      method: { type: 'string', description: 'HTTP method' },
      headers: { type: 'object', description: 'HTTP headers' }
    },
    required: ['url']
  },
  category: 'network',
  requiresConfirmation: true
}
```

**功能**: 获取网页内容

#### WebSearchTool

```typescript
{
  name: 'WebSearch',
  description: 'Search the web for information',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' }
    },
    required: ['query']
  },
  category: 'network'
}
```

**功能**: 网络搜索

### 4.5 任务管理工具

#### TaskCreateTool

```typescript
{
  name: 'TaskCreate',
  description: 'Create a new task',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Task description' },
      status: { type: 'string', description: 'Task status' }
    },
    required: ['title']
  },
  category: 'task'
}
```

**功能**: 创建任务

#### TaskUpdateTool

```typescript
{
  name: 'TaskUpdate',
  description: 'Update an existing task',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task ID' },
      title: { type: 'string' },
      description: { type: 'string' },
      status: { type: 'string' }
    },
    required: ['id']
  },
  category: 'task'
}
```

**功能**: 更新任务

#### TaskListTool

```typescript
{
  name: 'TaskList',
  description: 'List all tasks',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status' }
    }
  },
  category: 'task'
}
```

**功能**: 列出任务

### 4.6 代理与团队工具

#### AgentTool

```typescript
{
  name: 'Agent',
  description: 'Run a specialized agent for a task',
  inputSchema: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: 'Agent type' },
      task: { type: 'string', description: 'Task description' }
    },
    required: ['agent', 'task']
  },
  category: 'agent'
}
```

**功能**: 调用子代理执行任务

#### TeamCreateTool

```typescript
{
  name: 'TeamCreate',
  description: 'Create a team of agents',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Team name' },
      agents: { type: 'array', items: { type: 'string' }, description: 'Agent types' }
    },
    required: ['name', 'agents']
  },
  category: 'team'
}
```

**功能**: 创建代理团队

#### TeamDeleteTool

```typescript
{
  name: 'TeamDelete',
  description: 'Delete a team',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Team name' }
    },
    required: ['name']
  },
  category: 'team',
  requiresConfirmation: true
}
```

**功能**: 删除团队

### 4.7 模式控制工具

#### EnterPlanModeTool

```typescript
{
  name: 'EnterPlanMode',
  description: 'Enter planning mode for complex tasks',
  inputSchema: { type: 'object' },
  category: 'mode'
}
```

**功能**: 进入规划模式

#### ExitPlanModeTool

```typescript
{
  name: 'ExitPlanMode',
  description: 'Exit planning mode',
  inputSchema: { type: 'object' },
  category: 'mode'
}
```

**功能**: 退出规划模式

### 4.8 技能工具

#### SkillTool

```typescript
{
  name: 'Skill',
  description: 'Execute a skill from the skill library',
  inputSchema: {
    type: 'object',
    properties: {
      skill: { type: 'string', description: 'Skill name' },
      input: { type: 'object', description: 'Skill input parameters' }
    },
    required: ['skill']
  },
  category: 'skill'
}
```

**功能**: 执行技能库中的技能

### 4.9 MCP 工具

```typescript
{
  name: 'MCPTool',
  description: 'Execute an MCP (Model Context Protocol) tool',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Tool name' },
      input: { type: 'object', description: 'Tool input' }
    },
    required: ['name', 'input']
  },
  category: 'mcp'
}
```

**功能**: 执行 MCP 协议工具

---

## 五、工具执行流程

### 5.1 完整流程

```
┌──────────────────────────────────────────────────────────────────┐
│                     工具执行流程                                │
└──────────────────────────────────────────────────────────────────┘

1. 模型生成 tool_use 响应
       │
       ▼
2. 解析工具名称和参数
       │
       ▼
3. 查找注册的工具
       │
       ▼
4. 调用 canUse() 检查权限
       │
       ▼
5. requestPermission() 用户确认
       │
       ▼ (允许)
6. 执行 tool.execute()
       │
       ▼
7. 处理 ToolResult
       │
       ▼
8. 返回结果给模型
```

### 5.2 权限检查流程

```typescript
export async function requestPermission(req: PermissionRequest): Promise<boolean> {
  // 1. 检查是否需要权限
  if (!needsPermission(req.toolName)) return true
  
  // 2. 检查权限模式
  if (permissionMode === 'acceptEdits') {
    if (['Write', 'Edit', 'ApplyPatch'].includes(req.toolName)) return true
  }
  
  // 3. 检查会话缓存
  const cacheKey = req.toolName + ':' + JSON.stringify(req.input).slice(0, 200)
  if (sessionApprovals.has(cacheKey)) {
    return sessionApprovals.get(cacheKey)!
  }
  
  // 4. 交互式询问
  const answer = await askUser('  Allow? (y/n/always): ')
  if (answer === 'always' || answer === 'y') {
    sessionApprovals.set(cacheKey, true)
    return true
  }
  return false
}
```

---

## 六、工具分类

| 分类 | 工具列表 | 说明 |
|------|----------|------|
| `file` | ReadFile, WriteFile, EditFile, ApplyPatch | 文件操作 |
| `system` | Bash | 系统命令 |
| `search` | Grep, Glob | 搜索功能 |
| `network` | WebFetch, WebSearch | 网络访问 |
| `task` | TaskCreate, TaskUpdate, TaskList | 任务管理 |
| `agent` | Agent | 代理调用 |
| `team` | TeamCreate, TeamDelete | 团队管理 |
| `mode` | EnterPlanMode, ExitPlanMode | 模式控制 |
| `skill` | Skill | 技能执行 |
| `mcp` | MCPTool | MCP 协议 |

---

## 七、自定义工具开发

### 7.1 开发步骤

1. **创建工具目录**: `src/tools/builtin/MyTool/`

2. **实现工具类**:

```typescript
import { buildStandardTool, type ToolUseContext, type ToolResult } from '../../Tool.js'

export const MyTool = buildStandardTool({
  name: 'MyTool',
  description: 'My custom tool description',
  inputSchema: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'First parameter' },
      param2: { type: 'number', description: 'Second parameter' }
    },
    required: ['param1']
  },
  prompt: 'Use this tool for specific purpose',
  category: 'other',
  
  async execute(context: ToolUseContext, input: Record<string, unknown>): Promise<ToolResult> {
    try {
      // 执行逻辑
      const result = await doSomething(input)
      return {
        content: JSON.stringify(result),
        success: true
      }
    } catch (error) {
      return {
        content: `Error: ${error.message}`,
        success: false,
        error: error.message
      }
    }
  }
})
```

3. **注册工具**:

在 `src/tools/tools.ts` 中导入并添加到 `getTools()` 函数：

```typescript
import { MyTool } from './builtin/MyTool/MyTool.js'

export function getTools(): Tool[] {
  return [
    // ... 其他工具
    MyTool,
  ]
}
```

### 7.2 最佳实践

| 原则 | 说明 |
|------|------|
| **输入验证** | 使用 JSON Schema 验证输入参数 |
| **错误处理** | 捕获异常并返回结构化错误信息 |
| **权限控制** | 危险操作设置 `requiresConfirmation: true` |
| **文档完善** | 提供清晰的 `description` 和 `prompt` |
| **类型安全** | 使用 `buildTool` 确保类型正确 |

---

**文档版本**: v1.0  
**生成时间**: 2026-05-15