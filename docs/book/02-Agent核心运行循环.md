# 第二章：Agent 核心运行循环

Agent 核心运行循环是整个 Claude Code 的心脏。每一次用户输入，都会触发一轮完整的"感知-思考-行动-观察"循环。本章从消息准备开始，到 System Prompt 组装、API 通信、工具调度、结果收集，最后深入探讨设计中的权衡。

## 2.1 整体流程

一个典型的 Agent 循环分为六个阶段：

```
用户输入 → [消息准备] → [System Prompt 组装]
    → [API 请求 & 流式响应] → [工具调用解析]
    → [工具并发执行] → [结果回送]
    → 模型继续生成 → 循环直到完成
```

每一轮循环称为一个 **turn**。QueryEngine 负责记录每个 turn 的记账信息：耗时、token 用量、工具调用次数、行数变更等。

## 2.2 消息准备

用户按下 Enter 后，旅程从 REPL Screen 的 `handlePromptSubmit` 开始。

**第一步：输入预处理**

用户输入的原文本会经过多层处理：

- **类型识别**：是普通文本、slash command（`/compact`）、还是 shell escape（`!git status`）？
- **附件处理**：拖入的文件路径会被解析为 `MessageAttachment`，内容被读取并编码
- **上下文注入**：若用户引用了特定代码行或文件，这些引用会被解析并附加到消息中
- **消息构建**：最终构建为 `UserMessage` 结构体，包含 role、content（可含多段 text/image/tool_result）

**第二步：消息队列**

构建好的消息不会直接发送，而是先进入 AppState 的消息列表。这个列表是整个对话的"真理源"——所有参与者（用户、Assistant、工具结果）的消息都按时间顺序存储在这里。

**第三步：发送触发**

当消息队列准备好后，REPL 组件调用 `onBeforeQuery` 回调，然后调用 `query()`。这个函数是 API 通信的入口。

## 2.3 System Prompt 动态组装

Claude Code 的 System Prompt 不是静态文本，而是**每一次 query 都重新组装**的。这是它区别于简单聊天应用的关键设计。

组装过程在 `context.ts` 中完成，主要包含以下组成部分：

**（1）角色定义**
- 你是谁（Code CLI agent）
- 你的能力范围
- 行为约束（如"不要猜测用户意图"）

**（2）当前工作环境**
- 项目类型（通过 package.json、语言检测等）
- Git 状态（当前分支、未提交的变更、最近提交）
- 操作系统和 Shell 类型
- 当前目录和项目根目录
- 当前日期和时间

**（3）CLAUDE.md 注入**

CLAUDE.md 是项目级的指令文件，有三级级联规则：

- 全局 `~/.claude/CLAUDE.md` — 用户个人偏好
- 项目根 `CLAUDE.md` — 项目级约定
- 子目录 `CLAUDE.md` — 模块级说明

每级都会在 System Prompt 中追加一条"项目指南"段落。这种级联设计让团队可以在仓库中提交项目约定，同时保留个人工作流差异。

**（4）Memory 注入**

跨会话持久化的 Memory 会被检索并注入到 System Prompt 中。详见第四章。

**（5）工具列表**

当前可用的所有工具定义会被注入为 JSON Schema 格式。这是模型"知道"自己能做什么的途径。工具列表不是固定的——它取决于：

- Feature Flag 开启的工具
- 当前 Agent 类型（主线程 agent vs 子 agent 有不同的工具可见性）
- MCP 服务器的动态工具

**（6）系统指令**

由 settings.json 中的 `systemPrompt` / `appendSystemPrompt` 配置注入，或者通过 policy 注入的强制指令。

**组装时机**

System Prompt 在每次 API 调用前组装，而不是缓存的。这意味着：

- 每次 query 都能反映最新的环境状态
- 每次 query 都能反映最新的 Memory
- 每次 query 都能反映最新的工具列表

代价是每次调用都多消耗一些 token，但这是保证"感知准确性"的必要设计。

## 2.4 流式 API 通信

组装好 messages + system prompt 后，`query()` 函数调用 API 层发起请求。

**请求构建**

- 模型选择：优先 `modelType` 参数 > 环境变量 > 默认 firstParty
- 参数组装：model、messages、system、tools、temperature、thinking_config、betas
- 特征头：根据启用的 feature 注入 beta flags
- 超时控制：AbortController 用于取消

**Stream 类——生产者-消费者模式**

API 响应是流式的，Claude Code 使用自定义的 `Stream<T>` 类来处理。这是一个经典的**生产者-消费者模式**：

```typescript
class Stream<T> {
  queue: T[]          // 已到达但未被消费的数据
  readResolve?        // 等待中的消费者
  isDone: boolean     // 流是否结束
  hasError?           // 流是否出错
}
```

- **生产者**：API 的 SSE 事件处理函数，每收到一个 `content_block_delta` 就 `enqueue()`
- **消费者**：渲染层，每帧调用 `next()` 获取最新内容
- **背压处理**：如果消费者消费速度慢于生产者，数据在 queue 中堆积；如果消费者快于生产者，通过 `readResolve` 挂起等待

**SSE 事件处理**

Anthropic API 返回 `BetaRawMessageStreamEvent` 事件流，关键事件类型：

- `message_start`：消息开始，包含 message ID 和初始 usage
- `content_block_start`：内容块开始（text 或 tool_use）
- `content_block_delta`：增量内容（text delta 或 tool_use 的 input JSON delta）
- `content_block_stop`：内容块结束
- `message_delta`：消息增量（包含 stop_reason、stop_sequence 和 usage delta）
- `message_stop`：消息结束——此时模型已做出完整响应

## 2.5 工具并发调度

当模型返回 `stop_reason: "tool_use"` 时，Agent 循环进入**工具执行阶段**。

**步骤 1：解析工具调用**

从 API 响应中提取所有 `tool_use` content blocks。每个 block 包含：

- tool name（工具名）
- input（JSON 格式的输入参数）
- id（工具调用 ID，用于关联结果）

**步骤 2：并发执行**

`useStreamingToolExecution` 是这个阶段的核心逻辑。关键设计点是**并发执行**：

- 所有工具调用被解析后**同时启动**（不串行）
- 每个工具有自己的执行上下文（ToolUseContext）
- 每个工具有自己的 AbortSignal（可单独取消）
- 执行结果通过 Promise 收集

**步骤 3：权限检查**

在工具实际执行前，会经过权限层：

- `canUse()` 检查：工具自身定义的前置条件
- 权限模式检查：allow / deny / ask（由用户设置的 permission mode 决定）
- MCP 工具的特殊权限处理

如果用户拒绝某个工具，会生成一个"用户拒绝"的 tool_result，而不是让执行失败。

**步骤 4：结果收集与配对**

工具执行完成后，结果必须与对应的 `tool_use` block 正确配对。这是通过 `ensureToolResultPairing` 完成的：

- 每个 tool_result 包含 `tool_use_id`，与 tool_use 的 id 匹配
- 如果某个工具调用没返回结果（超时或崩溃），会生成一个空的 tool_result 作为"兜底"
- 在 strict 模式下（HFI 启用），空结果会抛出错误而非静默修复

## 2.6 结果回送与迭代

工具结果收集完毕后，会构造新的消息（role: "user"，content: tool_result blocks），然后**再次调用 API**。这就是 Agent 循环的"迭代"本质：

```
模型思考 → 工具调用 → 执行 → 观察结果 → 模型继续思考 → ...
```

这个过程会持续，直到：

1. 模型返回 `stop_reason: "end_turn"` — 任务完成
2. 模型返回 `stop_reason: "max_tokens"` — 达到 token 上限
3. 用户手动中断（Ctrl+C）
4. 工具触发终止条件（如 exit tool）

## 2.7 QueryEngine 的协调作用

QueryEngine 是更上层的协调器，它包装了 `query()` 并提供额外的管理功能：

- **对话状态管理**：维护消息列表、处理 compaction 边界、管理附件
- **归因记录**：记录每个 turn 的 token 消耗、工具调用、行数变更
- **文件快照**：在执行前和执行后拍摄文件快照，用于变更追踪
- **Token 预算管理**：监控当前对话的 token 用量，在接近上限时预警
- **缓存管理**：跟踪 prompt cache 的命中和未命中，优化后续请求

## 2.8 异常兜底

真实世界的网络和 API 不会永远可靠，Agent 循环必须处理各种异常：

**（1）HTTP 529（过载）**

Anthropic API 的 529 状态码表示服务过载。`shouldRetry529` 函数决定是否重试，策略是指数退避 + 随机抖动。

**（2）网络超时**

每个 API 请求都有超时控制（通过 AbortController）。超时后触发重试逻辑。

**（3）工具执行异常**

- 工具抛出异常 → 捕获后生成错误 tool_result（包含错误消息）
- 工具超时（超过执行时间限制）→ 生成空 tool_result
- 工具返回无效内容 → 截断或清洗后返回

**（4）JSON 解析错误**

模型有时会返回格式不正确的工具调用（invalid JSON input）。系统会尝试修复（用 JSON 解析器自动纠错），如果修复失败则返回解析错误。

**（5）静默失败检测**

当工具返回空结果但无错误时，系统通过 `tool_result` 配对机制检测——如果一个工具调用完全没有对应结果，它会生成一个"无结果"的兜底消息，让模型知道这个工具没有返回有效数据。

## 2.9 设计权衡讨论

Agent 循环的设计不是一个纯粹的技术问题，而是多个目标的权衡：

**（1）循环深度 vs 响应延迟**

每一轮工具调用 → API 调用都引入延迟。浅循环（工具调用限制少）让模型更灵活但更慢；深循环（严格限制工具调用次数）更快但可能限制模型解决问题的能力。

Claude Code 的选择：不设硬性限制，由模型自行决定何时"end_turn"。这是相信模型能力的体现，也意味着用户可能遇到长时间运行的循环。用户可以通过 Ctrl+C 中断。

**（2）工具注册的灵活性 vs 安全性**

工具系统支持运行时动态注册（通过 `buildTool`），这提供了极大的灵活性，但也带来了安全风险——一个恶意工具可以做任何事情。

Claude Code 通过多层防护来平衡：
- 工具按来源过滤（内置 vs 自定义）
- 代理按类型限制工具可见性（ALL_AGENT_DISALLOWED 列表）
- 权限模式（allow / deny / ask）由用户控制
- 异步 agent 的工具白名单更严格

**（3）上下文管理粒度 vs 性能**

精确的 token 计数让上下文管理更精细，但每次 API 调用前都做完整 token 计算有性能开销。

Claude Code 使用混合策略：最近的 API 响应提供精确 usage 数据，远端的消息用估算。这样既控制了开销，又保留了精确度。

**（4）并发 vs 串行工具执行**

并发执行工具（默认）更快，但可能引入顺序问题——如果工具 A 依赖工具 B 的结果（如先写文件、再读文件），并发会导致数据竞争。

Claude Code 的选择：默认并发执行，不提供内置的依赖声明机制。如果用户/模型需要顺序执行，必须在一个工具调用的结果中等待另一个完成。这简化了框架，但要求模型自行管理工具间的依赖关系。

---

**本章小结**：Agent 核心运行循环是消息准备、System Prompt 组装、API 通信、工具调度和异常处理的一个有机整体。每一阶段都有精心设计的权衡，整体目标是让模型能在复杂、不确定的环境中可靠工作。下一章将深入 Context 管理——这个保障长对话质量的关键技术。
