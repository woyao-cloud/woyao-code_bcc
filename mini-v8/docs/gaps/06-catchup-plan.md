# mini-v8 追平完整版 Multi-Agent 系统计划

## 当前状态 vs 目标

### mini-v8 当前状态

```
agentRunner.ts (460 行)
├── runAgent() — 同步等待 agent 完成
├── while 循环 + turn 限制
├── Map<agentId, AgentRunContext> 上下文追踪
└── 问题：调用方阻塞，无法并行多个 agent

AgentTool.ts (132 行)
├── await runAgent() — 同步等待
└── 问题：调用 AgentTool 的父 agent 被阻塞

teamManager.ts (429 行)
├── createTeam / deleteTeam — 基本 CRUD
├── addTeamMember / removeTeamMember
├── JSON 文件持久化
└── 问题：无消息路由，无 mailbox，无 teammate 执行
```

### 目标状态（对齐完整版）

```
async/background 执行
├── run_in_background 参数 → 立即返回 async_launched
├── 前景→后景 切换（Ctrl+B 等价信号）
├── 多个 agent 并发运行
├── task-notification 通知机制
└── 进度追踪（tokens/tool_uses/duration）

上下文隔离
├── AsyncLocalStorage（替代 Map 栈）
├── 嵌套 agent 不互相干扰
├── 每个 agent 独立 AbortController
└── setAppState 隔离（async agent 用 no-op）

Agent Memory
├── MEMORY.md + topic 文件 持久化
├── memory scope: user / project / local
├── snapshot 初始化 + 提示更新
├── memory prompt 自动注入 system prompt
└── 文件工具自动注入

Mailbox 通信
├── ~/.claude/teams/{team}/inboxes/{name}.json
├── writeToMailbox / readMailbox / markRead
├── lockfile 并发安全
├── structured protocol messages (JSON type routing)
└── permission_request/response, idle_notification

任务生命周期
├── TaskStore: create / update / complete / fail / kill
├── task-notification XML 格式
├── commandQueue 优先级投递
└── SDK system 事件发射
```

---

## Phase 1: Async Agent 执行（基础）

### 目标
让 `runAgent()` 支持后台异步执行，AgentTool 不再阻塞父 agent。

### 改动清单

#### 1.1 agentTypes.ts — 扩展类型

```typescript
// 新增
interface AgentTaskState {
  taskId: string
  agentId: string
  agentType: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  prompt: string
  model: string
  startTime: number
  endTime?: number
  // 进度
  progress: {
    totalTokens: number
    toolUseCount: number
    lastActivity: number
    summary?: string
  }
  // 结果
  result?: AgentResult
  error?: string
  // 控制
  abortController: AbortController
  notified: boolean
}

// 扩展 AgentRunOptions
interface AgentRunOptions {
  // ... 现有
  runInBackground?: boolean      // 新增
  onProgress?: (progress: AgentProgress) => void  // 新增
}

// 新增
interface AgentProgress {
  turnCount: number
  totalTokens: number
  toolUseCount: number
  lastActivity: number
  summary?: string
}
```

#### 1.2 agentRunner.ts — 拆分为两个函数

**改动策略**：将当前的 `runAgent()` 重命名为 `runAgentSync()`，新增 `runAgentAsync()`。

```
agentRunner.ts 重构
├── runAgentSync(options) → AgentResult       // 当前实现，改名
├── runAgentAsync(options) → AgentTaskState   // 新增，立即返回
│   ├── 创建 AgentTaskState (status: running)
│   ├── 注册到 AgentTaskStore
│   ├── void runAgentLoop(taskState)  // fire-and-forget
│   └── return taskState
└── runAgentLoop(taskState)                    // 核心循环（公共）
    ├── 从 runAgentSync 提取核心循环逻辑
    ├── while turnCount < maxTurns
    ├── stream API → parse tool calls → execute → collect
    ├── 每轮更新 taskState.progress
    ├── 完成时 taskStore.complete(taskId, result)
    ├── 失败时 taskStore.fail(taskId, error)
    └── 发送 task-notification
```

**关键实现细节**：

1. **AbortController 隔离**：
   - 同步 agent：共享父级 AbortController（父级 ESC 可以取消）
   - 异步 agent：创建新的独立 AbortController（父级 ESC 不影响后台任务）

2. **agentRunner 不感知 UI**：
   - 异步 agent 设置 `isInteractive: false`
   - 权限检查走 `canUseToolOverride` 或默认 deny（无法交互）
   - 工具结果直接序列化，无 JSX/组件渲染

#### 1.3 AgentTool.ts — 支持 run_in_background

```typescript
// AgentTool schema 新增参数
const AGENT_TOOL_SCHEMA = {
  properties: {
    // ... 现有
    run_in_background: {
      type: 'boolean',
      description: 'Set to true to run this agent in the background',
    },
  },
}

// execute() 分支
async execute(ctx, input) {
  const runInBackground = input.run_in_background === true
    || agentDef.background === true

  if (runInBackground) {
    const task = runAgentAsync({ agent, task, model })
    return {
      content: `Launched agent "${agentType}" in background (task: ${task.taskId})`,
      success: true,
      metadata: { status: 'async_launched', taskId: task.taskId },
    }
  }

  // 同步路径不变
  const result = await runAgentSync({ agent, task, model })
  // ...
}
```

#### 1.4 新增 services/taskStore.ts — AgentTaskStore

```typescript
// 替代当前的内存 Map<string, Task>
// 支持 agent task 的完整生命周期

class AgentTaskStore {
  private tasks = new Map<string, AgentTaskState>()

  create(params): AgentTaskState
  get(taskId): AgentTaskState | undefined
  list(filter?): AgentTaskState[]
  updateProgress(taskId, progress): void
  complete(taskId, result): void
  fail(taskId, error): void
  kill(taskId): void          // abort + cleanup
  getByAgentId(agentId): AgentTaskState | undefined
  getRunning(): AgentTaskState[]
}
```

---

## Phase 2: 上下文隔离（AsyncLocalStorage）

### 目标
并发 agent 在同一进程中互不干扰，每个 agent 有独立的事件/日志/状态上下文。

### 核心问题
当前 `Map<string, AgentRunContext>` 的 `getCurrentAgentContext()` 取最后注册的 agent，多 agent 并发时会拿到错误的上下文。

### 改动清单

#### 2.1 新增 utils/agentContext.ts

```typescript
// 使用 Node.js AsyncLocalStorage 替代 Map 栈
import { AsyncLocalStorage } from 'async_hooks'

interface SubagentContext {
  agentId: string
  agentType: string
  agentName?: string
  parentAgentId?: string
  teamName?: string
  isAsync: boolean
}

const agentContextStore = new AsyncLocalStorage<SubagentContext>()

// 在异步上下文中运行
export function runWithAgentContext<T>(
  context: SubagentContext,
  fn: () => Promise<T>,
): Promise<T> {
  return agentContextStore.run(context, fn)
}

// 任意深度获取当前上下文
export function getAgentContext(): SubagentContext | undefined {
  return agentContextStore.getStore()
}

// 类型守卫
export function isInAgentContext(): boolean {
  return agentContextStore.getStore() !== undefined
}
```

#### 2.2 改造 agentRunner.ts

```typescript
// runAgentLoop 改为在 ALS 上下文中运行
async function runAgentLoop(taskState: AgentTaskState): Promise<void> {
  const context: SubagentContext = {
    agentId: taskState.agentId,
    agentType: taskState.agentType,
    isAsync: true,
  }

  return runWithAgentContext(context, async () => {
    // 核心循环 —— 内部所有 log/debug/error 事件
    // 都会通过 getAgentContext() 获取正确的 agentId
    while (turnCount < maxTurns) { /* ... */ }
  })
}

// 嵌套 agent 自动继承父级上下文
export async function runAgentSync(options): Promise<AgentResult> {
  const parentCtx = getAgentContext()
  const context: SubagentContext = {
    agentId: instanceId,
    agentType: agentDef.agentType,
    parentAgentId: parentCtx?.agentId,
    isAsync: false,
  }

  return runWithAgentContext(context, async () => {
    return runAgentLoopCore(/* ... */)
  })
}
```

#### 2.3 改造 log.ts / debug.ts

```typescript
// 日志自动附加上下文 agentId
function logDebug(msg: string): void {
  const ctx = getAgentContext()
  const prefix = ctx ? `[agent:${ctx.agentId.slice(0, 8)}] ` : ''
  console.error(`${prefix}${msg}`)
}
```

#### 2.4 改造 context.ts（System Context 构建）

```typescript
// getSystemContext 感知当前 agent 上下文
// 异步 agent 跳过 CLAUDE.md 加载（减少 token）
export async function getSystemContext(...) {
  const agentCtx = getAgentContext()
  if (agentCtx?.isAsync) {
    // 简化上下文：只包含必要信息
    return buildMinimalContext()
  }
  return buildFullContext()
}
```

---

## Phase 3: Agent Memory 系统

### 目标
Agent 拥有跨会话持久化的记忆能力，能在多次 spawn 之间保持上下文。

### 设计参考
完整版的 Memory 类型体系（user/feedback/project/reference）和 MEMORY.md 索引模式。

### 数据模型

```
~/.claude/agent-memory/<agentType>/    ← user scope
  ├── MEMORY.md                         ← 索引文件（200 行 / 25KB 上限）
  ├── user_role.md                      ← topic 文件
  └── feedback_xxx.md

.cwd/.claude/agent-memory/<agentType>/ ← project scope (VCS 共享)
.cwd/.claude/agent-memory-local/<agentType>/ ← local scope (不提交)
```

### 改动清单

#### 3.1 扩展 AgentDefinition

```typescript
// agentTypes.ts
interface AgentDefinition {
  // ... 现有
  memory?: 'user' | 'project' | 'local'  // 新增
}
```

#### 3.2 新增 agents/agentMemory.ts

```typescript
// 核心函数
export function getAgentMemoryDir(
  agentType: string,
  scope: 'user' | 'project' | 'local',
): string

export function loadAgentMemoryPrompt(
  agentType: string,
  scope: 'user' | 'project' | 'local',
): string
// → 读取 MEMORY.md，拼接 prompt 指令
// → 返回完整 memory prompt 段落

// Memory prompt 内容包括：
// - 4 种 memory type 定义
// - 什么该存/什么不该存
// - 如何写 memory 文件
// - 当前 MEMORY.md 内容

export function ensureAgentMemoryDir(
  agentType: string,
  scope: 'user' | 'project' | 'local',
): void
// 确保目录存在，创建空的 MEMORY.md
```

#### 3.3 新增 agents/agentMemorySnapshot.ts

```typescript
interface SnapshotCheck {
  action: 'none' | 'initialize' | 'prompt-update'
}

export function checkAgentMemorySnapshot(
  agentType: string,
): SnapshotCheck
// 检查 .claude/agent-memory-snapshots/<agentType>/snapshot.json

export function initializeFromSnapshot(agentType: string): void
// 复制 snapshot 文件到 memory 目录

export function replaceFromSnapshot(agentType: string): void
// 删除现有 memory 文件，用 snapshot 替换

export function markSnapshotSynced(agentType: string): void
// 更新 .snapshot-synced.json 时间戳
```

#### 3.4 修改 AgentTool.ts — 工具自动注入

```typescript
// 当 agent 有 memory scope 且指定了 tools 列表时
// 自动注入 Write, Edit, Read 三个文件工具
async execute(ctx, input) {
  const agentDef = getAgent(agentType)
  if (agentDef?.memory && agentDef.tools && agentDef.tools[0] !== '*') {
    // 确保 agent 能写入自己的 memory 目录
    const toolSet = new Set(agentDef.tools)
    for (const t of ['Write', 'Edit', 'Read']) {
      if (!toolSet.has(t)) agentDef.tools.push(t)
    }
  }
}
```

#### 3.5 修改 builtInAgents.ts — memory scope 示例

```typescript
// 给 Explore agent 添加 local memory（记住用户的搜索偏好）
export const EXPLORE_AGENT: AgentDefinition = {
  // ... 现有
  memory: 'local',
}

// 给 Plan agent 添加 project memory（团队共享规划经验）
export const PLAN_AGENT: AgentDefinition = {
  // ... 现有
  memory: 'project',
}
```

#### 3.6 memory prompt 注入 system prompt

```typescript
// 在 runAgent 构建 system prompt 时
async function buildAgentSystemPrompt(agentDef: AgentDefinition): Promise<string> {
  let prompt = agentDef.getSystemPrompt()

  if (agentDef.memory) {
    const memoryPrompt = loadAgentMemoryPrompt(
      agentDef.agentType,
      agentDef.memory,
    )
    prompt += '\n\n' + memoryPrompt
  }

  return prompt
}
```

---

## Phase 4: Mailbox 通信系统

### 目标
Team 成员之间可以通过消息传递进行通信，支持权限代理和状态通知。

### 数据模型

```
~/.claude/teams/<team>/inboxes/
├── team-lead.json        ← [{ from, text, timestamp, read, color, summary }]
├── worker-1.json
└── worker-2.json
```

### 协议消息类型（JSON 嵌入 text 字段）

| type | 方向 | 用途 |
|------|------|------|
| `idle_notification` | Worker→Lead | Worker 完成任务，进入空闲 |
| `permission_request` | Worker→Lead | Worker 需要工具权限审批 |
| `permission_response` | Lead→Worker | Lead 的权限决定 |
| `team_permission_update` | Lead→Workers | 广播权限规则变更 |
| `shutdown_request` | Lead→Worker | 请求 Worker 关闭 |
| `shutdown_response` | Worker→Lead | Worker 同意/拒绝关闭 |

### 改动清单

#### 4.1 新增 agents/teammateMailbox.ts

```typescript
interface TeammateMessage {
  from: string
  text: string
  timestamp: string
  read: boolean
  color?: string
  summary?: string
}

// 文件操作（带 lockfile 并发控制）
export function writeToMailbox(
  recipientName: string,
  message: Omit<TeammateMessage, 'read'>,
  teamName: string,
): void

export function readMailbox(
  agentName: string,
  teamName: string,
): TeammateMessage[]

export function readUnreadMessages(
  agentName: string,
  teamName: string,
): TeammateMessage[]

export function markMessagesAsRead(
  agentName: string,
  teamName: string,
  indices: number[],
): void

// 结构化的 notification 构造
export function sendIdleNotification(
  workerName: string,
  teamName: string,
  reason: 'available' | 'interrupted' | 'failed',
  summary: string,
): void

// 压缩（消息数上限控制）
export function compactMailbox(
  agentName: string,
  teamName: string,
): void
```

#### 4.2 新增 agents/mailboxPoller.ts

```typescript
// Worker 侧：在 agent 循环中轮询 mailbox
// 替代完整版的 React useInboxPoller hook
export async function waitForNextMessage(
  agentName: string,
  teamName: string,
  options: {
    pollIntervalMs?: number   // 默认 500ms
    abortSignal: AbortSignal
    pendingMessages?: string[]
  },
): Promise<TeammateMessage | 'shutdown' | null>

// 检测 structured protocol message
export function isProtocolMessage(
  msg: TeammateMessage,
): boolean

// 路由 protocol message 到对应 handler
export function handleProtocolMessage(
  msg: TeammateMessage,
): {
  type: string
  action: 'prompt' | 'shutdown' | 'permission_response' | 'update_permissions'
  payload: unknown
}
```

#### 4.3 改造 agentRunner.ts — Worker 加入 mailbox 轮询

```typescript
// Worker agent 的主循环变体
async function runWorkerLoop(taskState: AgentTaskState): Promise<void> {
  // 先完成初始 task
  const result = await runAgentLoopCore(taskState)

  // 然后进入 mailbox 轮询等待更多指令
  while (!taskState.abortController.signal.aborted) {
    const msg = await waitForNextMessage(
      taskState.agentName,
      taskState.teamName,
      { abortSignal: taskState.abortController.signal },
    )

    if (msg === 'shutdown') break
    if (msg === null) continue

    // 收到新任务，继续执行
    taskState.prompt = msg.text
    await runAgentLoopCore(taskState)
  }
}
```

#### 4.4 改造 teamManager.ts — 集成 mailbox

```typescript
// createTeam 时创建 inbox 目录和初始化文件
export function createTeam(name, description, leadType) {
  // ... 现有逻辑

  // 新增：初始化团队的 inbox 目录结构
  initializeTeamMailboxes(team)
  // 给 lead 发送欢迎消息
  writeToMailbox('team-lead', {
    from: 'system',
    text: JSON.stringify({ type: 'team_created', team: team.name }),
    timestamp: new Date().toISOString(),
    summary: `Team "${team.name}" created`,
  }, team.name)

  return { team, leadMemberId }
}
```

---

## Phase 5: 通知系统（task-notification）

### 目标
后台 agent 完成/失败后，父 agent 能收到结构化通知并继续处理结果。

### task-notification XML 格式

```xml
<task-notification>
<task-id>abc-123</task-id>
<tool-use-id>toolu_xxx</tool-use-id>
<output-file>/path/to/agent-output.txt</output-file>
<status>completed</status>
<summary>Agent Explore completed searching for API endpoints</summary>
<result>Found 15 API endpoints across 3 files:</result>
<usage>
  <total_tokens>1500</total_tokens>
  <tool_uses>8</tool_uses>
  <duration_ms>12000</duration_ms>
</usage>
</task-notification>
```

### 改动清单

#### 5.1 新增 services/notificationQueue.ts

```typescript
interface PendingNotification {
  id: string
  mode: 'task-notification'
  priority: 'now' | 'later'
  taskId: string
  toolUseId: string
  agentId: string
  status: string
  summary: string
  result?: string
  usage?: {
    totalTokens: number
    toolUses: number
    durationMs: number
  }
  createdAt: number
}

// 模块级队列（非 React state，CLI 流循环可访问）
let notificationQueue: PendingNotification[] = []

export function enqueueNotification(n: PendingNotification): void
export function drainNotifications(
  filter?: (n: PendingNotification) => boolean,
): PendingNotification[]
export function hasPendingNotifications(): boolean
export function clearNotification(id: string): void
```

#### 5.2 改造 taskStore — complete/fail 时发送通知

```typescript
// taskStore 的 complete 方法增加通知发送
complete(taskId: string, result: AgentResult): void {
  const task = this.tasks.get(taskId)
  if (!task) return

  task.status = 'completed'
  task.result = result
  task.endTime = Date.now()

  // 构建并发送通知
  if (!task.notified) {
    task.notified = true
    enqueueNotification({
      id: randomUUID(),
      mode: 'task-notification',
      priority: 'later',      // 在用户输入之后处理
      taskId: task.taskId,
      toolUseId: task.toolUseId,
      agentId: task.agentId,
      status: 'completed',
      summary: `Agent "${task.agentType}" completed: ${task.prompt.slice(0, 100)}`,
      result: result.content.join('\n\n').slice(0, 2000),  // 截断
      usage: {
        totalTokens: result.totalTokens,
        toolUses: result.totalToolUseCount,
        durationMs: result.totalDurationMs,
      },
      createdAt: Date.now(),
    })
  }
}
```

#### 5.3 改造 entrypoints/cli.ts — 主循环 drain 通知

```typescript
// 在主对话循环中，每轮开始前 drain 通知
async function mainLoop() {
  while (true) {
    // 1. 先处理待投递的通知（注入为 user 消息）
    const notifications = drainNotifications(
      n => n.agentId === undefined  // 只处理主线程的通知
    )

    for (const notif of notifications) {
      const xml = buildTaskNotificationXML(notif)
      conversation.fullMessages.push({
        role: 'user',
        content: xml,
      })
    }

    // 2. 处理用户输入
    // 3. 调用 API
    // 4. 处理 tool calls
  }
}
```

#### 5.4 通知对子 agent 的可见性

```typescript
// 子 agent 只看到自己的通知
// drainNotifications 支持 agentId 过滤
function drainForAgent(agentId: string): PendingNotification[] {
  return drainNotifications(n => n.agentId === agentId)
}
```

---

## 实现优先级与依赖

```
Phase 1: Async 执行 (无依赖，可立即开始)
  └── 产出: runAgentAsync, AgentTaskStore, AgentTool 分支

Phase 2: 上下文隔离 (依赖 Phase 1)
  └── 产出: agentContext.ts (ALS), log 改造, context 简化

Phase 3: Agent Memory (依赖 Phase 1，可与 Phase 2 并行)
  └── 产出: agentMemory.ts, snapshot, prompt 注入, 工具注入

Phase 4: Mailbox 通信 (依赖 Phase 1+2)
  └── 产出: teammateMailbox.ts, mailboxPoller, Worker loop

Phase 5: 通知系统 (依赖 Phase 1)
  └── 产出: notificationQueue, CLI drain, XML 格式
```

```
依赖关系图：

Phase 1 (Async) ──┬── Phase 2 (ALS Isolation)
                  ├── Phase 3 (Agent Memory)      ← 可与 Phase 2 并行
                  ├── Phase 4 (Mailbox)           ← 依赖 Phase 2
                  └── Phase 5 (Notifications)
```

## 文件改动总览

### 修改现有文件

| 文件 | Phase | 改动内容 |
|------|-------|---------|
| `agents/agentTypes.ts` | 1,3 | 添加 AgentTaskState, AgentProgress, memory scope |
| `agents/agentRunner.ts` | 1,2,3,4 | 拆为 sync/async, ALS 包装, memory 注入, Worker 轮询 |
| `agents/builtInAgents.ts` | 3 | 添加 memory scope 示例 |
| `tools/builtin/AgentTool/AgentTool.ts` | 1,3 | 添加 run_in_background, 工具注入 |
| `tools/builtin/TeamCreateTool/TeamCreateTool.ts` | 4 | 集成 mailbox 初始化 |
| `tools/builtin/TeamDeleteTool/TeamDeleteTool.ts` | 4 | 集成 mailbox 清理 |
| `agents/teamManager.ts` | 4 | 集成 mailbox |
| `services/taskStore.ts` | 1,5 | 重构为 AgentTaskStore + 通知 |
| `entrypoints/cli.ts` | 5 | 主循环 drain 通知 |
| `utils/log.ts` | 2 | ALS 感知的日志前缀 |

### 新增文件

| 文件 | Phase | 内容 |
|------|-------|------|
| `utils/agentContext.ts` | 2 | AsyncLocalStorage 上下文隔离 |
| `agents/agentMemory.ts` | 3 | Memory 目录/prompt/读写 |
| `agents/agentMemorySnapshot.ts` | 3 | Snapshot 同步机制 |
| `agents/teammateMailbox.ts` | 4 | Mailbox 文件操作 + lockfile |
| `agents/mailboxPoller.ts` | 4 | Worker 侧轮询 + 协议路由 |
| `services/notificationQueue.ts` | 5 | 通知队列（非 React） |

### 测试文件

| 文件 | Phase | 内容 |
|------|-------|------|
| `__tests__/agentRunner.async.test.ts` | 1 | 异步执行、并发、取消 |
| `__tests__/agentContext.test.ts` | 2 | ALS 嵌套、隔离验证 |
| `__tests__/agentMemory.test.ts` | 3 | Memory 读写、snapshot、prompt |
| `__tests__/teammateMailbox.test.ts` | 4 | Mailbox CRUD、并发写入 |
| `__tests__/notificationQueue.test.ts` | 5 | 入队、drain、XML 构建 |

---

## 风险与注意事项

1. **ALS 兼容性** — `AsyncLocalStorage` 是 Node.js API，Bun 完整支持（`node:async_hooks`），已验证
2. **lockfile 并发** — Mailbox 写入需要文件锁，使用 `proper-lockfile` 或自行实现简单的重试+backoff
3. **token 消耗** — Agent Memory 的 MEMORY.md 随使用增长，需要截断逻辑（200 行 / 25KB 上限已在 Phase 3 规划中）
4. **内存泄漏** — fire-and-forget 的 agent loop 如果异常未捕获会导致未处理的 Promise rejection，Phase 1 需在 runAgentLoop 中加全局 try/catch
5. **测试隔离** — Phase 4 mailbox 测试需要 mock 文件系统或使用 temp dirs，避免污染实际 `~/.claude/teams/`
6. **向后兼容** — 所有改动需保持现有同步 `runAgent()` API 不变（Phase 1 保留为 `runAgentSync`）
