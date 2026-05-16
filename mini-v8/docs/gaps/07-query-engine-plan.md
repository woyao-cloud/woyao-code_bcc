# mini-v8 Query Engine 追平计划

## 现状 vs 目标

### mini-v8 当前状况

```
cli.ts
└── runConversationTurn() (~240 行)
    ├── while(true) 单循环
    ├── streamClaudeAPI() 直接调用
    ├── 逐工具执行（串行）
    ├── projectMessagesForAPI() 已存在
    ├── persistConversationSnapshot()
    └── 硬编码 system prompt
```

### 完整版目标结构

```
query.ts (2042 行)           — 核心生成器循环
├── query()                    — 入口包装器
├── queryLoop()                — while(true) 主循环
│   ├── Phase 1: 前置处理 (compaction/projection/budget)
│   ├── Phase 2: API 调用 + streaming 处理
│   ├── Phase 3: 后置恢复 (错误恢复/stop hooks)
│   └── Phase 4: 工具执行
├── State 类型                  — 循环状态
├── Terminal / Continue         — 循环退出/继续原因
└── deps 注入                   — 可测试性

QueryEngine.ts (1365 行)      — 高层编排器
├── submitMessage()             — 单次用户输入处理
├── 系统 prompt 组装
├── 消息类型归一化
├── 会话持久化集成
├── 预算执行 (maxTurns/maxBudget)
└── interrupt() / setModel()

紧凑子系统                          — 窗口管理
├── autoCompact.ts
├── microCompact.ts (部分已存在)
├── reactiveCompact.ts
├── snipCompact.ts
└── compact.ts (forked-agent 压缩)
```

## Phase 1: 核心循环提取 (src/query.ts)

### 动机
当前 `runConversationTurn()` 与 CLI 耦合严重。提取为独立模块后：
- Agent runner 可复用（子 agent 的循环）
- 可独立测试（deps injection）
- 支持 `yield` 式事件流（notifications, progress）

### 改动清单

#### 1.1 新建 `src/query/transitions.ts`

```typescript
// 循环终止原因
type Terminal =
  | { reason: 'completed' }
  | { reason: 'max_turns'; turnCount: number }
  | { reason: 'model_error'; error?: string }
  | { reason: 'aborted' }

// 循环继续原因
type Continue =
  | { reason: 'next_turn' }
  | { reason: 'recovery_compact' }
  | { reason: 'max_output_tokens_retry'; attempt: number }
```

#### 1.2 新建 `src/query.ts`

从 `cli.ts` 提取核心循环逻辑，改造为 `async generator`：

```typescript
interface State {
  messages: BetaMessageParam[]
  turnCount: number
  abortController: AbortController
  toolResults: ContentItem[]
}

export async function* query(params: QueryParams):
  AsyncGenerator<StreamEvent | Terminal>
{
  // ... 核心循环
  while (true) {
    // Phase 1: 前置处理 (compaction)
    // Phase 2: API 调用 + streaming
    // Phase 3: 后置检查 + 恢复
    // Phase 4: 工具执行
  }
}
```

**关键变更**：
- `cli.ts` 中的 toolUses/contentBlocks/fullText 归入 `State`
- spinner 动画留在 cli.ts（yield 事件，consumer 决定 UI）
- 权限检查通过 `canUseTool` callback 注入
- `withRetry` 保留，但内部错误分类移入 query.ts

#### 1.3 简化 `cli.ts` 的 `runConversationTurn()`

```typescript
async function runConversationTurn(conversation, tools) {
  for await (const event of query({
    systemPrompt, messages, tools, model,
    canUseTool: async (name, input) => { /* 权限弹窗 */ },
  })) {
    if (event.type === 'text_delta') process.stdout.write(event.text)
    if (event.type === 'terminal') break
    // ...
  }
}
```

### 文件变动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/query.ts` | **新增** | 核心循环，~400 行 |
| `src/query/transitions.ts` | **新增** | 类型定义，~30 行 |
| `src/entrypoints/cli.ts` | **修改** | `runConversationTurn` 简化为 consumer |
| `src/agents/agentRunner.ts` | **修改** | `runAgentLoopCore` 复用 query.ts |

---

## Phase 2: QueryEngine 编排器 (src/QueryEngine.ts)

### 动机
将 `query()` 包装为有状态类，管理：
- 会话级状态 (messages, usage, turn count)
- 系统 prompt 组装 (system context + agent prompt + memory)
- 持久化集成 (自动保存 conversation 快照)
- 多轮用户输入间状态保持

### 改动清单

#### 2.1 新建 `src/QueryEngine.ts`

```typescript
export class QueryEngine {
  private mutableMessages: BetaMessageParam[]
  private abortController: AbortController
  private totalTokens: number
  private maxTurns: number

  constructor(options?: {
    systemPrompt?: string
    messages?: BetaMessageParam[]
    maxTurns?: number
  })

  async *submitMessage(prompt: string):
    AsyncGenerator<QueryEvent>
  // 处理用户输入 → 调用 query() → 归一化事件

  interrupt(): void       // 终止当前查询
  getMessages(): BetaMessageParam[]
  setModel(model: string): void
}
```

**提交协议** (yield 的事件类型)：
```typescript
type QueryEvent =
  | { type: 'text'; text: string }
  | { type: 'tool_start'; name: string; id: string }
  | { type: 'tool_result'; name: string; success: boolean }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done'; reason: string }
```

#### 2.2 修改 `cli.ts` 集成 QueryEngine

```typescript
const engine = new QueryEngine({
  messages: conversation.fullMessages,
  maxTurns: config.maxTurns,
})

// REPL 循环
while (true) {
  // drain notifications...
  const line = await question('> ')
  for await (const event of engine.submitMessage(line)) {
    switch (event.type) {
      case 'text': process.stdout.write(event.text); break
      case 'tool_start': process.stderr.write(`\n  ${event.name}...`); break
      // ...
    }
  }
  persistConversationSnapshot(engine.getMessages())
}
```

### 文件变动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/QueryEngine.ts` | **新增** | ~250 行 |
| `src/entrypoints/cli.ts` | **修改** | 用 QueryEngine 替代裸循环 |
| `src/entrypoints/cli.ts` | **删除** | `runConversationTurn()` 函数 |

---

## Phase 3: 紧凑子系统完善

### 现状
- `projectMessagesForAPI()` 已存在（微压缩 + 预算 + 全压缩）
- 但仅被调用一次，未做主动/预测性压缩
- 缺少 `autoCompact.ts`（阈值自动触发）
- 缺少 `reactiveCompact.ts`（API 413 恢复）

### 改动清单

#### 3.1 新增 `src/services/compact/autoCompact.ts`

```typescript
export function autoCompactIfNeeded(
  conversation: ConversationBuffers,
  model: string,
): boolean
// 在上下文占用超过 70% 时自动触发压缩
// 返回 true 表示已压缩
```

从完整版移植核心逻辑（简化）：
- 阈值：context window 的 70%
- 保留：首条消息 + 最近 N 对 (N=3)
- 防抖：连续失败 3 次后跳过

#### 3.2 新增 `src/services/compact/reactiveCompact.ts`

```typescript
export function reactiveCompact(
  conversation: ConversationBuffers,
): boolean
// API 返回 413 / prompt-too-long 时紧急压缩
// single-shot 防护（hasAttemptedReactiveCompact）
```

#### 3.3 在 query.ts 中集成

```typescript
// Phase 1: 前置处理
autoCompactIfNeeded(conversation, model)
const { messagesForAPI } = projectMessagesForAPI(conversation, {...})

// Phase 3: 后置恢复
if (isWithheld413) {
  reactiveCompact(conversation)
  continue  // 重试
}
```

### 文件变动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/compact/autoCompact.ts` | **新增** | ~60 行 |
| `src/services/compact/reactiveCompact.ts` | **新增** | ~50 行 |
| `src/query.ts` | **修改** | 集成压缩 |
| `src/context.ts` | **修复** | 需修复 pre-existing type errors |

---

## Phase 4: 工具执行增强

### 现状
- 工具串行执行（逐个 await）
- 无结果持久化（全在内存）
- 无并发执行

### 改动清单

#### 4.1 串行 → 并发分批

```typescript
// 工具按安全级别分组
const safeTools = new Set(['Grep', 'Glob', 'Read', 'WebFetch', 'Bash'])
const readonlyTools = toolUses.filter(t => safeTools.has(t.name))
const writeTools = toolUses.filter(t => !safeTools.has(t.name))

// 只读工具并发执行
await Promise.all(readonlyTools.map(t => executeTool(t)))

// 写入工具串行执行
for (const t of writeTools) { await executeTool(t) }
```

#### 4.2 工具结果预算（磁盘持久化）

当工具结果超过阈值时：
1. 写入临时文件
2. 替换为 `<persisted-output>` 标签
3. 下一轮自动释放

```typescript
// src/services/toolResultStorage.ts (新增 ~80 行)
export function applyToolResultBudget(results: ContentItem[]): ContentItem[]
```

### 文件变动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/query.ts` | **修改** | 工具执行分批 |
| `src/services/toolResultStorage.ts` | **新增** | ~80 行 |

---

## Phase 5: 错误恢复 (Recovery)

### 现状
- `cli.ts` 仅区分 `abort` 和 `API error`
- 无 max_output_tokens 恢复
- 无 413 恢复

### 改动清单

在 query.ts 的 Phase 3 中增加：

```typescript
// max_output_tokens 恢复
if (isWithheldMaxOutputTokens && recoveryCount < 3) {
  recoveryCount++
  yield { type: 'max_tokens_recovery', attempt: recoveryCount }
  messages.push(buildRecoveryMessage('continue your response...'))
  continue
}

// 413 prompt-too-long 恢复
if (isWithheld413 && !hasAttemptedReactiveCompact) {
  hasAttemptedReactiveCompact = true
  reactiveCompact(conversation)
  yield { type: 'recovery_compact' }
  continue
}
```

### 文件变动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/query.ts` | **修改** | 增加 Phase 3 恢复逻辑 |

---

## 实现优先级与依赖

```
Phase 1: 核心循环提取 (无依赖)
  └── 产出: src/query.ts, query/transitions.ts

Phase 2: QueryEngine (依赖 Phase 1)
  └── 产出: src/QueryEngine.ts

Phase 3: 紧凑子系统 (可并行 Phase 2)
  └── 产出: autoCompact.ts, reactiveCompact.ts

Phase 4: 工具执行增强 (依赖 Phase 1)
  └── 产出: 并发执行 + result storage

Phase 5: 错误恢复 (依赖 Phase 1)
  └── 产出: max_tokens 恢复 + 413 恢复
```

```
依赖关系图：

Phase 1 (核心循环) ──┬── Phase 2 (QueryEngine)
                     ├── Phase 3 (紧凑子系统) ← 可并行 Phase 2
                     ├── Phase 4 (工具增强)    ← 依赖 Phase 1
                     └── Phase 5 (错误恢复)    ← 依赖 Phase 1
```

## 文件改动总览

### 新增文件

| 文件 | Phase | 行数估计 |
|------|-------|---------|
| `src/query/transitions.ts` | 1 | ~30 |
| `src/query.ts` | 1 | ~400 |
| `src/QueryEngine.ts` | 2 | ~250 |
| `src/services/compact/autoCompact.ts` | 3 | ~60 |
| `src/services/compact/reactiveCompact.ts` | 3 | ~50 |
| `src/services/toolResultStorage.ts` | 4 | ~80 |

### 修改文件

| 文件 | Phase | 改动 |
|------|-------|------|
| `src/entrypoints/cli.ts` | 1,2 | `runConversationTurn` → consumer of QueryEngine |
| `src/agents/agentRunner.ts` | 1 | `runAgentLoopCore` 复用 query.ts |
| `src/context.ts` | 3 | 修复 pre-existing type errors |

## 风险与注意事项

1. **向后兼容** — 所有新文件 + 旧 API 保留过渡期
2. **agentRunner 解耦** — `runAgentLoopCore` 当前有独立 API 循环逻辑，Phase 1 后应共享 `query.ts`
3. **测试策略** — `query.ts` 的 deps injection 使测试更容易
4. **增量迁移** — 每个 Phase 独立可测试，不要一次性重写
5. **context.ts type errors** — 需先修复 pre-existing 错误，否则 typecheck 无法通过


| Phase | 内容 | 行数估 | 关键产出 |
|-------|------|--------|----------|
| 1 | 核心循环提取 | ~430 | src/query.ts + query/transitions.ts，从 cli.ts 解耦为 async generator |
| 2 | QueryEngine 编排器 | ~250 | src/QueryEngine.ts，有状态类管理会话/持久化/预算 |
| 3 | 紧凑子系统完善 | ~110 | autoCompact.ts + reactiveCompact.ts，70% 阈值自动压缩 + 413 恢复 |
| 4 | 工具执行增强 | ~80 | 只读工具并发执行 + toolResultStorage.ts 磁盘持久化 |
| 5 | 错误恢复 | —— | max_output_tokens 3 次重试 + 8k→64k 升级 + 413 自动收缩 |
关键差异：完整版 query engine 约 3400 行（query.ts 2042 + QueryEngine.ts 1365），mini 目标版约 870 行，聚焦最核心功能，跳过 Langfuse、beta headers、cache editing、stop hooks 等高级特性。
每个 Phase 独立可测试，不阻塞。要开始 Phase 1？

# Phase 1 已完成。
Typecheck 零新增错误。改动总结：
新增文件
src/query/transitions.ts (72行)
- QueryTerminal / QueryEvent 等事件类型 — 定义 generator yield 协议
src/query.ts (260行)
- async function* query() — 核心循环生成器，管理：
  - 多轮循环 + turn 限制
  - API streaming + 逐事件收集
  - 工具执行 + 权限检查
  - 消息管理 (push assistant + tool results)
  - 错误处理 (abort/model_error)
- 通过 QueryOptions 注入：model、maxTurns、abortSignal、canUseTool、onSystemContext、isInteractive
修改文件
src/entrypoints/cli.ts
- runConversationTurn 从 240行自管理循环 → 60行 event consumer
- 循环、streaming、工具执行全部委托给 query() generator
- cli 层只处理 UI：spinner、stdout 输出、tool 状态打印、持久化、memory 抽取
设计关键
由于 yield 不能在箭头函数内使用，streaming 回调中先收集 textDeltas[] 和 toolUses[]，流结束后再统一 yield。这是与旧版最大的架构变化。
未完事项
- agentRunner.ts 的 runAgentLoopCore 尚未复用 query.ts（可后续优化）
- cli.ts 中一些旧的 import 未清理（不影响编译）


# Phase 2 已完成。改动总结：
新增文件
src/QueryEngine.ts (87行) — 有状态编排器类
class QueryEngine {
  constructor(options)     // 初始化 messages, systemPrompt, tools, model
  submitMessage(input)     // async generator — 封装 query() + 追踪 state
  interrupt()              // 终止当前查询
  setModel() / setTools()  // 运行时变更
  getTotalInput/OutputTokens(), getTurnCount()  // 状态读取
}
通过 submitMessage() 统一入口：先 push user message，再 delgate 给 query()，自动累计 totalInputTokens/totalOutputTokens/turnCount。
修改文件
src/entrypoints/cli.ts
- runREPL / runConversation 创建 new QueryEngine({...}) 并复用
- runConversation(engine, ...) 用 engine.submitMessage() 替代直接操作
- 去掉了 const gen = query(...) 的直接调用
当前状态
| Phase | 状态 |
|-------|------|
| 1. 核心循环提取 (query.ts) | ✅ |
| 2. QueryEngine 编排器 | ✅ |
| 3. 紧凑子系统 | ⬜ |
| 4. 工具执行增强 | ⬜ |
| 5. 错误恢复 | ⬜ |
下一阶段建议：Phase 3（autoCompact + reactiveCompact）或 Phase 4（工具并发执行），可并行执行。

# Phase 3 已完成。Typecheck 零新增错误。
发现：autoCompact 已存在
src/services/compact/autoCompact.ts (788行) 已经完整实现，包含：
- needsCompaction() — 70% 上下文窗口阈值检查
- compactMessages() — 全压缩（首条 + 摘要 + 最近 N 对）
- microcompactToolResults() — 高频工具结果清理
- applyToolResultBudget() — 大结果预览截断
- apiProjection.ts 已在 projectMessagesForAPI() 中完整调用
新增文件
src/services/compact/reactiveCompact.ts (43行)
- isPromptTooLongError() — 检测 API 413 / prompt-too-long 错误（匹配 6 种模式）
- reactiveCompact() — 三级降级策略：
  1. 先 microcompact（最轻量）
  2. 再 full compact keepPairs=2
  3. 最后 keepPairs=1 硬压缩
修改文件
src/query.ts
- 新增 hasAttemptedReactiveCompact 标志（单次防护）
- catch 块中检测 prompt-too-long 错误时：
  1. 调用 reactiveCompact()
  2. 同步更新外部 messages 数组
  3. continue 重试当前 turn
  4. 防止无限循环
当前状态
| Phase | 状态 |
|-------|------|
| 1. 核心循环提取 | ✅ |
| 2. QueryEngine 编排器 | ✅ |
| 3. 紧凑子系统 | ✅ |
| 4. 工具执行增强 | ⬜ |
| 5. 错误恢复 | ⬜ |
继续 Phase 4（工具并发执行 + result storage）？

Phase 4 已完成。Typecheck 零新增错误。
改动总结
src/query.ts — 工具执行重构
串行执行 → 并发分批执行：
- 权限检查：保持串行（用户体验需要）
- 只读工具 (Grep/Glob/Read/WebFetch/WebSearch)：Promise.all 并发执行，最大 5 个一批
- 写入工具 (Write/Edit/Bash 等)：保持串行执行
- 同时引入 persistLargeToolResult() 自动持久化大结果
新增 src/services/toolResultStorage.ts (88行)
- persistLargeToolResult(value) — 结果 > 100KB 时自动写入 os.tmpdir()/mini-v8-tool-results/，替换为 <persisted-output>path</persisted-output> 标签
- restorePersistedToolResult(value) — 从标签恢复原始内容
- cleanupAllPersistedResults() / releasePersistedResult() — 清理
当前状态
| Phase | 状态 |
|-------|------|
| 1. 核心循环提取 | ✅ |
| 2. QueryEngine 编排器 | ✅ |
| 3. 紧凑子系统 | ✅ |
| 4. 工具执行增强 | ✅ |
| 5. 错误恢复 | ⬜ |
继续 Phase 5（max_output_tokens 恢复 + 最终错误处理）？