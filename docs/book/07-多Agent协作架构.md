# 第七章：多 Agent 协作架构

当任务复杂度超出了单一 Agent 的能力——比如需要同时搜索代码、阅读文档、编写代码、运行测试——一个更优的方案是：让多个专门的 Agent 分工协作。Claude Code 的 Agent 系统支持从简单的子任务委托到复杂的多 Agent 集群编排。本章深入分析这一架构。

## 7.1 为什么需要多 Agent

单 Agent 的能力边界：

1. **上下文限制**：一个 Agent 的 system prompt + 消息列表不能无限膨胀
2. **关注点混杂**：同一个 Agent 既要理解代码又要执行 Shell 命令，认知负载高
3. **阻塞性**：在主线程上串行走，一个工具调用卡住就卡住整个交互
4. **工具冲突**：某些工具对主线程 agent 可用但对子 agent 应隐藏

多 Agent 架构通过"分解 → 委派 → 汇总"的模式解决这些问题。

## 7.2 AgentTool：核心抽象

`AgentTool` 是整个多 Agent 系统的核心接口。它不是 UI 组件，而是一个**内置工具**，供主 Agent 在推理过程中"调用"。

### AgentTool 的工作原理

当主 Agent 决定"这个任务需要子 Agent 来做"时，它会通过 AgentTool 发送一个"spawn"请求：

```
主 Agent 生成 tool_use 块
  ├── tool: "Agent"
  ├── subagent_type: "explore" | "plan" | "general-purpose"
  ├── prompt: "搜索 src/auth/ 下的所有文件"
  └── description: "了解认证模块结构"
      ↓
AgentTool 执行器：
  1. 解析子 Agent 类型
  2. 根据类型筛选可用工具
  3. 创建子 Agent 的执行上下文
  4. 启动子 Agent 的独立循环
  5. 等待子 Agent 完成（同步）或返回 ID（异步）
  6. 收集结果返回给主 Agent
```

### 子 Agent 的生命周期

```
创建：
  resolveAgentTools(agentDef, availableTools) → 筛选工具
  → 创建 ToolUseContext（独立的 permission context）
  → 如果同步：在当前线程中执行
  → 如果异步：放入后台队列，返回 agentId

执行：
  子 Agent 执行自己的"感知-思考-行动"循环
  使用筛选后的工具列表
  独立的 API 调用（与主 Agent 共享 chainId）
  独立的 token 记账

完成：
  返回结果 → 主 Agent 看到 tool_result
  如果异步：主 Agent 用 agentId 查询进度
```

## 7.3 工具过滤规则

子 Agent 不能使用所有工具——这是安全性的核心机制。工具过滤通过多层规则实现：

**第一层：AL L_AGENT_DISALLOWED_TOOLS**

所有 Agent（无论类型、来源）都不能使用的工具。包含：
- `Agent`（防无限嵌套，见下节）
- `EnterWorktreeTool`（工作树操作）
- `ExitWorktreeTool`
- 以及部分管理类工具

**第二层：CUSTOM_AGENT_DISALLOWED_TOOLS**

自定义 Agent（非内置 Agent 类型）不能使用的工具：
- 部分系统管理类工具
- 高风险操作

**第三层：ASYNC_AGENT_ALLOWED_TOOLS**

异步 Agent（后台运行）只能使用的工具：
- `Read`、`Glob`、`Grep`（只读操作）
- `WebSearch`、`WebFetch`（只读网络操作）
- 不包含任何写操作工具

异步 Agent 的白名单是最严格的——因为它们不在用户直接监督下运行。

**第四层：permissionMode**

Agent 自身的 permission mode 也可能限制工具：
- `plan` 模式：只能使用计划相关的工具（`Agent`、`TaskCreate`、`ExitPlanMode`）
- 常规模式：按 agent type 的规则执行

### resolveAgentTools 函数

`resolveAgentTools` 是工具过滤的"中央处理器"。它接收 agent 定义、可用工具列表和标志，返回经过所有规则过滤后的工具列表。如果配置了 `disallowedTools` 字段，这些工具也会被排除。

## 7.4 Fork 子 Agent

"Fork"是多 Agent 架构中的基础操作——创建一个拥有独立上下文的子 Agent。

### Fork 的独立性

Fork 出的子 Agent 与主 Agent 共享：

- **Project root**：同一个项目目录
- **CLAUDE.md**：同一套指令体系
- **Memory**：同一个 memory store
- **Settings**：同一套配置

但拥有独立的：

- **Message list**：子 Agent 从零开始（只有 system prompt + 委派 prompt）
- **Tool execution context**：独立的权限上下文
- **Tool permissions**：独立的允许/拒绝列表
- **CWD**：可以有自己的工作目录
- **API 调用**：独立发起（共享 parent 的 chainId）

### Fork 的创建

Fork 通过 `AgentTool` 创建，但更底层的实现是在 `forkedAgent.ts` 中：

```typescript
// 简化的 fork 过程
function forkAgent(agentDef, prompt, context) {
  1. 解析 agent 定义（type、tools、model、constraints）
  2. 筛选工具（通过 resolveAgentTools）
  3. 创建新的 ToolUseContext（继承部分属性）
  4. 注入 system prompt + 委派 prompt
  5. 启动 agent 的 query loop
  6. 等待完成 → 返回结果
}
```

### 日志记录

每次 fork 都会通过 `logForkAgentQueryEvent` 记录日志，包含 fork label、执行时长、message count、token 消耗和 nested tracking 信息。这使得"主 Agent → 子 Agent 链"在日志中完全可追踪。

## 7.5 嵌套与递归防护

AgentTool 最需要防范的是**无限嵌套**——主 Agent spawn 子 Agent，子 Agent spawn 孙子 Agent，直到资源耗尽。

### AL L_AGENT_DISALLOWED_TOOLS 机制

AgentTool 自身被列入 `ALL_AGENT_DISALLOWED_TOOLS`——这意味着：
- **默认情况下**，任何子 Agent 都不能使用 AgentTool
- 子 Agent 不能 spawn 自己的子 Agent
- 嵌套深度被"一刀切"地限制为 1

### In-process Teammate 例外

在 Swarms 模式下（`isAgentSwarmsEnabled()`），in-process teammate有特殊权限：
- 可以使用 AgentTool spawn 同步子 agent
- 可以使用 TaskCreate/TaskUpdate/TaskList 等任务协调工具
- 但限制：不能 spawn 背景 agent，不能 spawn 其他 teammate

这种例外是有意设计的——Swarms 模式的核心就是多 Agent 协作，如果禁止嵌套就失去了意义。

### 深度控制实践

即使在允许嵌套的场景下，系统也通过以下方式控制深度：
- 不在 system prompt 中告诉子 Agent "你可以使用 AgentTool"
- 对子 Agent 屏蔽了 AgentTool 的描述
- 如果子 Agent 意外发现了 AgentTool 并尝试使用，会被过滤规则拒绝

## 7.6 并发子任务

多 Agent 的一个关键能力是**并发执行**——同时运行多个子 Agent 处理不同的子任务。

### 同步 vs 异步

AgentTool 支持两种执行模式：

**同步（Sync）**：
- 主 Agent 发送 spawn 请求后**等待**子 Agent 完成
- 子 Agent 返回结果前，主 Agent 不进行下一步
- 适用于：子任务结果是后续步骤的前置条件
- 行为类似于"函数调用"

**异步（Async）**：
- 主 Agent 发送 spawn 请求后立即收到 agentId
- 主 Agent 可以继续其他工作
- 通过 agentId 查询子 Agent 进度或结果
- 适用于：可以并行执行、不需要立即结果的任务

### 异步 Agent 的特殊约束

异步 Agent 因为"在用户看不见的地方运行"，有更严格的约束：
- 只读工具白名单（见 7.3 节）
- 执行时间上限
- 资源限制（token budget、并发数）
- 超时自动终止

### 后台会话持久化

通过 BG_SESSIONS feature，异步 Agent 可以在独立的会话中运行，即使主进程退出也能继续。用户可以通过 `claude ps` 查看后台会话，用 `claude attach` 重新连接。

## 7.7 Coordinator Mode

Coordinator Mode 是更高级的多 Agent 编排模式，通过 `COORDINATOR_MODE` feature 和 `CLAUDE_CODE_COORDINATOR_MODE` 环境变量启用。

### 工作原理

在 Coordinator Mode 下，主 Agent 的角色从"执行者"转变为"协调者"：

1. **任务分解**：主 Agent 分析用户任务，分解为子任务
2. **Agent 分配**：将每个子任务分配给最适合的 Agent 类型
3. **结果收集**：等待所有子 Agent 完成
4. **结果汇总**：将分散的结果整合为最终答案
5. **冲突解决**：如果子 Agent 结果冲突，协调者裁决

### In-process Teammate

在 Swarms 模式下，Agent 可以以"in-process teammate"的形式运行——它们共享同一个进程空间，通过共享的 task list 协调：

```
主 Agent (协调者)
  ├── Agent: 搜索代码 (in-process teammate)
  │   └── 使用 TaskCreate 创建任务项
  ├── Agent: 编写测试 (in-process teammate)
  │   └── 使用 TaskUpdate 更新进度
  └── Agent: 运行测试 (in-process teammate)
      └── 使用 TaskList 查看待办任务
```

这种模式下，teammate 共享：
- 进程内任务列表（TaskList）
- System prompt 的一部分（但不完全相同）
- 项目上下文

但各自拥有独立的工具执行上下文和 API 调用序列。

## 7.8 与 MCP 的关系

MCP（Model Context Protocol）服务器也可以提供"工具"给 Agent。这些工具与内置工具在接口层面上是统一的——Agent 看到的是 `mcp__serverName__toolName` 格式的工具名。

在多 Agent 场景中，MCP 工具的处理：

- 所有 Agent 类型（内置 + 自定义）都允许使用 `mcp__` 工具
- AgentTool 的 prompt 生成时会列出哪些 MCP 服务器有可用工具
- 不同子 Agent 可能只能看到 MCP 工具的子集

这使得 MCP 成为"Agent 的能力扩展机制"——通过连接新的 MCP 服务器，可以给所有 Agent 增加新工具。

## 7.9 边界情形与错误处理

**（1）子 Agent 崩溃**

子 Agent 在执行过程中抛出异常：
- 异常被外围的 `try/catch` 捕获
- 生成错误 tool_result（包含异常消息和调用栈摘要）
- 主 Agent 收到错误结果后决定后续步骤

**（2）子 Agent 超时**

子 Agent 超过执行时间限制：
- 异步 Agent 超时：记录告警，标记为"已超时"，结果可能为空
- 同步 Agent 超时：抛出异常，主 Agent 收到错误
- 超时阈值随 agent type 不同而变化

**（3）子 Agent 无限循环**

Agent 可能陷入"工具调用 → 执行 → 再次工具调用"的死循环：
- Token budget 用尽后循环自然终止
- 父 Agent 可以中断子 Agent
- 用户可以通过 Ctrl+C 中断

**（4）子 Agent 冲突**

多个子 Agent 同时修改同一个文件：
- 系统不提供内置的锁机制
- 最后写入的文件版本"获胜"
- 协调者 Agent 负责结果合并

## 7.10 设计权衡讨论

**（1）嵌套深度 vs 灵活性**

允许无限嵌套理论上更灵活，但实践中容易导致"失控"——Agent 链可以无限延伸，每个嵌套层级都引入延迟和 token 消耗。

方案：默认只允许 1 层嵌套（主 → 子），特殊场景（Swarms）允许更深但有限制。这类似于数据库连接池——不是技术上不能更多，而是实践中需要边界。

**（2）同步 vs 异步**

同步更简单（线性执行流），但浪费并行机会。异步更高效，但引入状态管理的复杂性。

方案：默认同步（因为大多数子任务有依赖关系），提供异步选项（用于可并行的只读任务）。AgentTool 的 prompt 对两者都做了描述，让模型自行选择。

**（3）共享上下文 vs 独立上下文**

子 Agent 共享主 Agent 的项目上下文可以更快开始工作（不用重新了解项目）。但完全独立的上下文让子 Agent 更专注。

方案：折中——子 Agent 继承 system prompt 的"项目环境"部分，但消息列表从零开始。这样既不重复加载上下文，又让子 Agent 专注于自己被委派的任务。

---

**本章小结**：Claude Code 的多 Agent 架构通过 AgentTool、多层工具过滤规则、Fork 机制和 Coordinator Mode，实现了从简单委派到复杂编排的完整能力。安全性（工具过滤、嵌套防护）和效率（并发执行、异步模式）之间的平衡是架构设计的核心主线。下一章将通过一个完整的请求追踪全链路，串联起前七章的所有内容。
