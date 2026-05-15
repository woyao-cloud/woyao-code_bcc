# Claude Code Mini v8 - 概要设计文档

> 版本: 8.0.0 | 日期: 2026-05-14

---

## 1. 设计目标

| 目标 | 说明 |
|------|------|
| 精简 | 单入口、单项目、无框架依赖 |
| 可扩展 | 插件/Skill/MCP 三通道扩展 |
| 高性能 | Bun 运行时、流式响应、进程内 Agent |
| 类型安全 | TypeScript Strict Mode、零 any |

---

## 2. 模块分解

### 2.1 模块依赖图

```
entrypoints/cli.ts
    |
    +---> context.ts
    |       |---> utils/claudemd.ts
    |       |---> utils/git.ts
    |       |---> services/skill/skillLoader.ts
    |       |---> services/memory/memoryStore.ts
    |       |---> agents/agentRegistry.ts
    |       |---> agents/teamManager.ts
    |
    +---> services/api/claude.ts
    |       |---> utils/auth.ts
    |       |---> utils/model/model.ts
    |       |---> utils/model/providers.ts
    |       |---> services/api/openai/client.ts
    |       |---> services/api/openai/streamAdapter.ts
    |       |---> services/api/openai/modelMap.ts
    |
    +---> tools/tools.ts
    |       |---> tools/builtin/* (19 tools)
    |       |---> services/mcp/mcpClient.ts
    |
    +---> services/permission/permissionManager.ts
    +---> services/compact/autoCompact.ts
    +---> services/retry.ts
    +---> commands/*
```

### 2.2 模块职责

| 模块 | 职责 | 输入 | 输出 |
|------|------|------|------|
| entrypoints/cli.ts | CLI入口, REPL循环, 模式分发 | process.argv, stdin | stdout/stderr |
| context.ts | 系统上下文构建 | CWD, Config | System Prompt 字符串 |
| Tool.ts | Tool 接口定义 | - | Tool/Context/Result 类型 |
| agents/ | Agent 注册/执行/团队管理 | Agent定义, 任务 | AgentResult |
| commands/ | REPL 斜杠命令处理 | 命令参数 | 响应文本 |
| services/api/ | API 调用 (流式/非流式) | QueryParams | StreamEvents |
| services/compact/ | 消息自动压缩 | messages[] | compacted messages[] |
| services/config/ | 配置读写 | - | AppConfig |
| services/mcp/ | MCP 协议客户端 | 服务器配置 | MCP 工具列表 |
| services/memory/ | 记忆存储/同步/提取 | messages, 记忆数据 | 记忆文本 |
| services/permission/ | 工具权限审批 | Tool请求 | allow/deny |
| services/skill/ | Skill 发现/Store | 项目根, 查询 | Skill列表 |
| plugins/ | 插件加载/安装 | 插件目录 | LoadedPlugin[] |
| tools/ | 工具注册/执行 | - | Tool[], ToolsMap |

---

## 3. 接口设计

### 3.1 Tool 接口

```typescript
interface Tool {
  name: string
  description: string
  inputSchema: ToolInputSchema    // JSON Schema
  prompt: string                   // 使用说明
  execute(ctx: ToolUseContext, input: Record<string,unknown>): Promise<ToolResult>
  canUse?(ctx: ToolUseContext, input: Record<string,unknown>): Promise<PermissionResult>
  userFacingName?(): string
}

interface ToolUseContext {
  toolUse: ToolUseBlockParam
  permissionMode: PermissionMode
  toolPermissionContext: ToolPermissionContext
  cwd: string
  abortSignal: AbortSignal
  messages: Message[]
  isInteractive: boolean
}

interface ToolResult {
  content: string      // 发送给API的结果
  rendered?: string    // 终端显示
  success: boolean
  error?: string
  metadata?: Record<string,unknown>
}
```

### 3.2 API 接口

```typescript
interface QueryParams {
  systemPrompt: string
  messages: BetaMessageParam[]
  tools: Tool[]
  model?: string
  signal?: AbortSignal
  maxTokens?: number
}

async function* streamClaudeAPI(params: QueryParams): AsyncGenerator<BetaRawMessageStreamEvent>
async function callClaudeAPI(params: QueryParams): Promise<Message>
```

### 3.3 Agent 接口

```typescript
interface AgentDefinition {
  agentType: string
  whenToUse: string
  description?: string
  tools?: string[]          // ["*"] 表示全部
  disallowedTools?: string[]
  skills?: string[]
  getSystemPrompt: () => string
  model?: string
  maxTurns?: number
  permissionMode?: string
  source: AgentSource       // built-in|user|project|plugin|local
  color?: string
  background?: boolean
  initialPrompt?: string
}

interface AgentResult {
  agentId: string
  status: "idle"|"running"|"completed"|"failed"|"cancelled"
  content: string[]
  totalTokens: number
  totalToolUseCount: number
  totalDurationMs: number
  error?: string
}
```

### 3.4 记忆接口

```typescript
interface Memory {
  id: string
  content: string
  tags: string[]
  category: string
  createdAt: string
  updatedAt: string
}

interface SessionMemoryNote {
  id: string
  category: string          // user-request|decision|context
  content: string
  timestamp: string
}

interface TeamMemoryEntry {
  key: string
  content: string
  checksum: string          // sha256:...
}
```

### 3.5 插件接口

```typescript
interface PluginManifest {
  name: string
  version: string
  description: string
  commands?: PluginCommandDef[]
  skills?: PluginSkillDef[]
  mcpServers?: PluginMcpServerDef[]
  dependencies?: Record<string,string>
  minAppVersion?: string
}

interface LoadedPlugin {
  pluginId: string
  manifest: PluginManifest
  installPath: string
  marketplace: string
  scope: PluginScope
  enabled: boolean
  errors: PluginError[]
}
```

---

## 4. 数据模型

### 4.1 消息类型层级

```typescript
type ContentItem =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string,unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
```

### 4.2 权限模型

```typescript
type PermissionMode = "default" | "acceptEdits" | "bypassPermissions"

interface ToolPermissionContext {
  mode: PermissionMode
  additionalWorkingDirectories: Map<string, string>
  alwaysAllowRules: Record<string, boolean>
  alwaysDenyRules: Record<string, boolean>
  isBypassPermissionsModeAvailable: boolean
}
```

### 4.3 任务模型

```typescript
type TaskStatus = "pending" | "in_progress" | "completed" | "failed"

interface Task {
  id: string                // task_N
  title: string
  description: string
  status: TaskStatus
  result?: string
  createdAt: string
  updatedAt: string
}
```

---

## 5. 关键算法

### 5.1 Agent 工具过滤算法

```
filterToolsForAgent(allTools, agentDef):
  1. 如果 agent.tools == ["*"] 且无 disallowedTools:
     -> 返回全部工具
  2. 如果 agent.tools == ["*"] 且有 disallowedTools:
     -> 返回排除 disallowedTools 后的工具
  3. 如果 agent.tools 非空:
     -> 仅返回匹配的工具
  4. 如果仅有 disallowedTools:
     -> 返回排除后的工具
  5. 默认返回全部工具
```

### 5.2 消息压缩算法

```
estimateTokens(messages):
  total = 0
  for msg in messages:
    total += len(serialize(msg.content)) / 4
  return total

needsCompaction(messages):
  return estimateTokens(messages) > 100000 * 0.7

compactMessages(messages, keepPairs=3):
  if len <= 6: return messages
  return [messages[0]] + messages[-6:]
```

### 5.3 记忆提取算法

```
extractSessionNotes(messages):
  notes = []
  用户消息 = filter(messages, role="user")[-5:]
  for each, add preview to notes
  AI决策 = regex match [/I will/, /Let's/, /We should/, /The plan is/]
  for each match, add to notes
  文件路径 = regex extract from messages
  for each unique path, add to notes
  return deduplicated notes
```

### 5.4 团队记忆同步算法 (Delta Sync)

```
pushTeamMemory(state):
  local = scanLocalTeamMemories()
  toUpload = []
  for entry in local:
    serverChecksum = state.serverChecksums.get(entry.key)
    if serverChecksum != entry.checksum:
      toUpload.push(entry)
  if toUpload.isEmpty: return
  send PUT request with toUpload
  update state.serverChecksums
```

---

## 6. 错误处理策略

| 层级 | 策略 | 实现 |
|------|------|------|
| API 调用 | 指数退避重试 (max 3次) | services/retry.ts |
| MCP 连接 | 跳过失败的服务器 (best-effort) | mcpClient.ts |
| 工具执行 | catch 返回 error ToolResult | 各 Tool.execute() |
| 文件操作 | try/catch + 返回 false/null | tools/builtin/* |
| Agent 运行 | catch 返回 failed AgentResult | agentRunner.ts |
| 记忆操作 | 所有操作 try/catch 保护 | services/memory/* |
| 插件加载 | 错误收集到 errors[] 继续 | pluginLoader.ts |

---

## 7. 扩展点设计

| 扩展点 | 机制 | 接口 |
|--------|------|------|
| 新工具 | 实现 Tool 接口 + 注册到 tools.ts | Tool interface |
| 新 Agent | 创建 .md 文件到 agents/ 目录 | AgentDefinition |
| 新 Provider | 实现流适配器 + 注册到 providers.ts | streamClaudeAPI pattern |
| 插件 | .codex-plugin/plugin.json | PluginManifest |
| MCP 服务器 | mcp.json 配置 | MCPServerConfig |
| Skill | SKILL.md 文件 | Skill interface |