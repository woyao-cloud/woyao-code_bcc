# CLI 设计文档

## 概述

CLI 是 Claude Code Mini 的主入口点，提供交互式 REPL (Read-Eval-Print Loop) 和非交互式两种模式。它负责协调各个子系统，管理对话流程，执行工具调用。

**文件位置**: `src/entrypoints/cli.ts`

---

## 架构概览

```
CLI
├── 启动流程
│   ├── 初始化状态
│   ├── 加载配置
│   ├── 加载插件
│   ├── 初始化记忆
│   └── 连接 MCP 服务器
├── 运行模式
│   ├── REPL 模式 (交互式)
│   └── 单次模式 (非交互式)
├── 对话循环
│   ├── 构建上下文
│   ├── 调用 Claude API
│   ├── 处理工具调用
│   ├── 权限检查
│   ├── 工具执行
│   ├── 对话压缩
│   └── 记忆提取
└── REPL 命令
    ├── 基础命令
    ├── 插件命令
    ├── Skill 命令
    ├── 记忆命令
    └── 同步命令
```

---

## 启动流程

### 初始化步骤

```
main()
    ↓
设置全局状态 (MACRO.VERSION, MACRO.BUILD_TIME)
    ↓
重置任务 (resetTasks)
    ↓
获取 API Key (getAPIKey)
    ├── 检查 ANTHROPIC_API_KEY
    └── 检查 OPENAI_API_KEY (如果是 OpenAI 提供商)
    ↓
加载配置 (loadConfig)
    ↓
加载插件 (loadAllPlugins)
    ↓
初始化会话记忆 (initSession)
    ↓
连接 MCP 服务器 (connectMCPServers)
    ↓
注册 MCP 工具 (registerMCPTools)
    ↓
检查运行模式
    ├── 有参数或管道输入 → 单次模式 (runConversation)
    └── 其他 → REPL 模式 (runREPL)
```

### 全局状态

```typescript
// 设置全局 MACRO 对象
;(globalThis as unknown as Record<string, unknown>).MACRO = {
  VERSION: '7.0.0',
  BUILD_TIME: new Date().toISOString()
}
```

---

## 运行模式

### REPL 模式

交互式模式，提供命令提示符。

```
Claude Code Mini v7.0.0 | 15 tools | 0 plugins | 3 skills
Type /help, Ctrl+C cancel, Ctrl+D exit

> 用户输入
> ...
```

**特点**:
- 无限轮对话
- 支持 `/` 前缀命令
- 会话记忆保持
- 可以随时退出

### 单次模式

非交互式模式，执行一次对话后退出。

使用方式:
```bash
# 命令行参数
bun run dev "写一个 Python 脚本"

# 管道输入
echo "写一个 Python 脚本" | bun run dev
```

---

## 对话循环 (runConversationTurn)

对话循环是核心业务逻辑，处理一轮完整的对话。

### 流程图示

```
┌─────────────────────────────────────────────────────────┐
│                    开始新一轮对话                          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  1. 构建系统上下文 (getSystemContext)                    │
│     ├── Skill 上下文 (discoverSkills)                    │
│     ├── Memory 上下文 (formatMemoriesForPrompt)          │
│     └── Git 上下文 (getIsGit, getBranch)                 │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  2. 调用 Claude API (streamClaudeAPI)                    │
│     ├── 流式接收响应                                      │
│     ├── 检测工具调用 (content_block_start)               │
│     ├── 增量构建工具输入 (input_json_delta)              │
│     └── 收集令牌统计                                      │
└─────────────────────────────────────────────────────────┘
                            ↓
                    是否有工具调用？
                            ├── 否 → 结束本轮
                            └── 是 → 继续
                            ↓
┌─────────────────────────────────────────────────────────┐
│  3. 处理工具调用 (for each toolUse)                      │
│     ├── 查找工具 (getToolsMap)                           │
│     ├── 权限检查 (requestPermission)                     │
│     ├── 构建上下文 (ToolUseContext)                      │
│     ├── 执行工具 (tool.execute)                          │
│     └── 收集结果                                          │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  4. 添加工具结果到对话历史                                │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  5. 检查是否需要对话压缩 (needsCompaction)               │
│     └── 需要 → 压缩对话 (compactMessages)                │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  6. 检查是否需要提取会话记忆 (shouldExtractMemory)       │
│     └── 需要 → 提取并保存 (extractSessionNotes, persistSessionMemory) │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│  7. 检查轮次限制 (最多 20 轮)                            │
└─────────────────────────────────────────────────────────┘
                            ↓
                        继续下一轮
```

### 关键数据结构

#### 消息格式

```typescript
// Claude API 消息格式
type BetaMessageParam = {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
```

#### 流式事件

```typescript
type BetaRawMessageStreamEvent =
  | { type: 'content_block_start'; content_block: ContentBlock }
  | { type: 'content_block_delta'; delta: TextDelta | InputJsonDelta }
  | { type: 'message_delta'; usage: Usage }
  // ... 其他事件
```

---

## 流式输入处理

### safeJsonMerge 函数

这是一个关键函数，用于增量构建工具输入。

**旧实现 (有 bug)**:
```typescript
function safeJsonMerge(
  _existing: Record<string, unknown>,
  partial: string
): Record<string, unknown> {
  try {
    return JSON.parse(partial) as Record<string, unknown>
  } catch {
    return {}  // ❌ 清空输入
  }
}
```

**新实现 (修复)**:
```typescript
function safeJsonMerge(
  existing: Record<string, unknown>,
  partial: string
): Record<string, unknown> {
  try {
    const parsed = JSON.parse(partial) as Record<string, unknown>
    return { ...existing, ...parsed }  // ✅ 合并而不是替换
  } catch {
    return existing  // ✅ 失败时保留现有输入
  }
}
```

**问题说明**:
- 旧实现忽略了 `existing` 参数
- 解析失败时返回空对象，导致输入丢失
- 新实现正确合并，并在失败时保留现有输入

### 流式处理代码

```typescript
const contentBlocks: ContentBlock[] = []
const toolUses: ToolUseBlock[] = []
let fullText = ''

for await (const event of streamClaudeAPI({...})) {
  switch (event.type) {
    case 'content_block_start':
      if (event.content_block.type === 'tool_use') {
        const tu: ToolUseBlock = {
          type: 'tool_use',
          id: event.content_block.id,
          name: event.content_block.name,
          input: (event.content_block.input as Record<string, unknown>) || {}
        }
        toolUses.push(tu)
        contentBlocks.push(tu)
        process.stderr.write(`\n  ${event.content_block.name}...`)
      }
      break

    case 'content_block_delta':
      if (event.delta.type === 'text_delta') {
        const lb = contentBlocks[contentBlocks.length - 1]
        if (lb && lb.type === 'text') lb.text += event.delta.text
        fullText += event.delta.text
      } else if (event.delta.type === 'input_json_delta') {
        const lt = toolUses[toolUses.length - 1]
        if (lt) lt.input = safeJsonMerge(lt.input, event.delta.partial_json)
      }
      break
  }
}
```

---

## REPL 命令

### 基础命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/exit` or `/quit` | 退出程序 |
| `/clear` | 清空对话历史 |
| `/tools` | 列出可用工具 |
| `/config` | 显示配置 |

### 插件命令

```
/plugin install|uninstall|list|enable|disable|marketplace
```

### Skill 命令

```
/skill-store list|search|install|uninstall|installed
/skill-search start|stop|status
```

### 记忆命令

```
/memory add|list|search|delete|categories|tags|export|import|extract
/session-memory on|off|status|config|view
/memory-stores list|create|get|archive|memories
```

### 同步命令

```
/sync-memory on|off|status|repo|pull|push|sync|list
```

---

## 工具执行

### 权限检查

```typescript
const allowed = await requestPermission({
  toolName: tool.name,
  toolDescription: tool.description,
  input: toolUse.input
})

if (!allowed) {
  toolResults.push({
    type: 'tool_result',
    tool_use_id: toolUse.id,
    content: 'Permission denied.',
    is_error: true
  })
  process.stderr.write(' (denied)\n')
  continue
}
```

### 上下文构建

```typescript
const ctx: ToolUseContext = {
  toolUse: {
    type: 'tool_use',
    id: toolUse.id,
    name: toolUse.name,
    input: toolUse.input
  },
  permissionMode: getPermissionMode(cwd) as 'default',
  toolPermissionContext: {
    mode: 'default',
    additionalWorkingDirectories: new Map(),
    alwaysAllowRules: {},
    alwaysDenyRules: {},
    isBypassPermissionsModeAvailable: false
  },
  cwd,
  abortSignal: new AbortController().signal,
  messages: [],
  isInteractive: true
}
```

### 执行和结果

```typescript
const result = await tool.execute(ctx, toolUse.input)
process.stderr.write(` (${result.success ? 'ok' : 'fail'})\n`)

toolResults.push({
  type: 'tool_result',
  tool_use_id: toolUse.id,
  content: result.content,
  is_error: !result.success
})
```

---

## 重试机制

API 调用使用重试机制处理临时错误。

```typescript
await withRetry(
  async () => {
    // API 调用
  },
  {
    maxRetries: 2,
    onRetry: (attempt, err) => {
      if (isRetryableError(err)) {
        process.stderr.write(`\n  Retrying (${attempt})...`)
      } else {
        throw err
      }
    }
  }
)
```

---

## 终止

### 清理

```typescript
try {
  // 运行对话
} finally {
  disconnectMCPServers(mcpEntries)
  endSession()
}
```

### 退出码

- `0`: 成功
- `1`: 错误 (API Key 缺失、致命错误等)

---

## 设计模式

### 状态机模式

REPL 使用状态机处理命令和对话。

### 观察者模式

流式 API 使用事件驱动处理。

### 策略模式

不同的运行模式 (REPL vs 单次) 使用相同的核心逻辑。

---

## 性能考虑

1. **流式处理**: 逐块处理响应，减少内存占用
2. **对话压缩**: 自动压缩历史，减少 token 使用
3. **并发加载**: 插件和 MCP 服务器并行加载
4. **增量更新**: 工具输入增量构建

---

## 错误处理

### API 错误

```typescript
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('abort')) {
    logError('Timeout')
  } else {
    logError('API error: ' + msg)
  }
  break
}
```

### 工具错误

工具执行错误返回 `success: false`，并包含错误信息。

---

## 测试覆盖

CLI 作为入口点，主要通过集成测试覆盖。

---

## 扩展点

1. **新的运行模式**: 添加批处理模式等
2. **自定义命令**: 通过插件添加新的 REPL 命令
3. **输出格式化**: 自定义输出格式
4. **插件钩子**: 在对话流程中添加钩子
5. **UI 替代**: 添加 GUI 或 Web 界面
