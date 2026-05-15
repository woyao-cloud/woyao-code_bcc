# Agent 与任务系统对比

## 概述

mini-v8 的 Agent 系统是最接近完整版的功能模块，保留了核心概念和主要流程，但缺少生产级基础设施。

## Agent 系统对比

### Agent 定义

| 方面 | 完整版 | mini-v8 | 一致度 |
|------|--------|---------|--------|
| 字段数量 | ~25+ 字段 | ~20 字段 | 高 |
| 类型 | AgentDefinition, BuiltInAgentDefinition | AgentDefinition | 高 |
| 加载源 | built-in, user dir, project dir, plugin | built-in, user dir, project dir, plugin | **一致** |
| 优先级 | built-in < user < project < plugin | 相同 | **一致** |
| 文件格式 | JSON (Zod 校验) + Markdown + frontmatter | JSON + Markdown + frontmatter | 高 |
| Hooks | onAgentStart/onAgentEnd + frontmatter hooks | 无 | 缺失 |
| Memory scopes | agentMemory.ts (key-value + snapshots) | 无 | 缺失 |
| Feature flags | BUILTIN_EXPLORE_PLAN_AGENTS, VERIFICATION_AGENT, FORK_SUBAGENT | 无 | 缺失 |

### 内置 Agent

| 完整版 | mini-v8 |
|--------|---------|
| GeneralPurpose | GeneralPurpose |
| Explore | Explore |
| Plan | Plan |
| Verify | Verify |
| ClaudeCodeGuide | —（无） |
| StatuslineSetup | —（无） |
| Coordinator / Worker (feature-gated) | Coordinator / Worker（始终可用） |

mini-v8 多了 Coordinator/Worker 常驻可用，但少了 ClaudeCodeGuide 和 StatuslineSetup 两个辅助 Agent。

### Agent 执行 (agentRunner.ts vs runAgent.ts)

| 方面 | 完整版 (runAgent.ts) | mini-v8 (agentRunner.ts) |
|------|---------------------|-------------------------|
| 执行模式 | 同步 + 后台异步 | 仅同步（进程内 while 循环） |
| 上下文隔离 | AsyncLocalStorage | Map<String, AgentRunContext> |
| 最大轮次 | 支持（可配置） | 支持（默认 25） |
| 权限检查 | 多层（hooks → classifier → permission check） | permissionManager 单层 |
| MCP 集成 | MCP tool fetching | 无 |
| Langfuse | tracing 集成 | 无 |
| Transcript | 会话记录 | 无 |
| Memory snapshot | agent memory snapshots | 无 |
| Plan mode | 完整支持 | 基础支持 |
| Fork subagent | 支持（FORK_SUBAGENT flag） | 无 |

## 任务系统对比

### 任务类型

| 完整版（7 种） | mini-v8（1 种） |
|---------------|----------------|
| LocalShellTask | — |
| LocalAgentTask | Task（通用） |
| RemoteAgentTask | — |
| DreamTask | — |
| InProcessTeammateTask | — |
| LocalWorkflowTask | — |
| MonitorMcpTask | — |

### 任务存储

| 方面 | 完整版 | mini-v8 |
|------|--------|---------|
| 存储后端 | 磁盘 JSON (.claude/teams/) | 内存 Map |
| 并发控制 | lockfile.ts | 无 |
| 变更通知 | Signal-based listener | 无 |
| 跨进程 | 支持 | 不支持 |

### 任务工具

| 工具 | 完整版 | mini-v8 |
|------|--------|---------|
| TaskCreateTool | YES | YES |
| TaskUpdateTool | YES | YES |
| TaskListTool | YES | YES |
| TaskGetTool | YES | NO |
| TaskOutputTool | YES | NO |
| TaskStopTool | YES | NO |

## Coordinator / Swarm 对比

### Coordinator Mode

| 方面 | 完整版 | mini-v8 |
|------|--------|---------|
| 激活方式 | COORDINATOR_MODE flag + env var + /coordinator 命令 | 作为普通 Agent 类型选择 |
| System Prompt | 370+ 行（phases, worker prompt-writing, continue vs spawn decision matrix, anti-patterns） | 简短 prompt |
| Permission | coordinator handler (sequential hooks + classifier + bubble mode) | 标准权限检查 |

### 团队/Swarm

| 方面 | 完整版 | mini-v8 |
|------|--------|---------|
| 团队模型 | name, description, lead, members (同) | 一致 |
| 持久化 | JSON + lockfile | JSON 文件 |
| 执行后端 | in-process, tmux, detached | 仅 in-process |
| 消息路由 | inbox/mailbox + leaderPermissionBridge + permissionSync | 基础状态追踪 |
| SendMessage | 支持（跨 Agent 消息传递） | 无 |
| Layout | tmux layout manager | 无 |
| Color | agentColorManager | 无 |
| Reconnection | teammate reconnection | 无 |

## mini-v8 Agent 系统的设计优点

1. **模块化清晰** — registry / runner / teamManager 三层分离良好
2. **AgentRegistry 设计优良** — 多源加载 + 优先级覆盖 + 搜索匹配
3. **TeamManager 完整** — CRUD + 持久化 + prompt 格式化
4. **agentRunner 简洁** — 核心循环（stream API → parse tool calls → execute → collect）易理解
5. **无过度抽象** — 去除了完整版的 feature flag gating 和多余的抽象层

## 关键差距

### 完全缺失（10 项）

1. **后台/异步 Agent 执行** — 所有 Agent 同步运行
2. **AsyncLocalStorage 上下文隔离** — 用 Map 代替，嵌套时可能冲突
3. **Agent Memory** — 无法跨会话保持上下文
4. **多任务后端** — 只有内存 Map，无磁盘/进程级任务管理
5. **Swarm 多后端** — 只有 in-process，无 tmux/detached
6. **Fork Subagent** — 无法继承父会话上下文
7. **SendMessage 续接** — Coordinator 无法与运行中的 Worker 互动
8. **Agent Lifecycle Hooks** — 无法在 Agent 生命周期节点注入逻辑
9. **Agent Color/Display** — 无 Agent 色彩管理
10. **Transcript/Tracing** — 无可观测性

### 简化实现（4 项）

1. **Coordinator System Prompt** — 从 370+ 行缩至几行
2. **Permission** — 从多层级缩至单层检查
3. **消息路由** — 从 mailbox 系统缩至基础状态更新
4. **错误处理** — 从分类错误体系缩至简单的 try/catch

## 总结

mini-v8 的 Agent 系统是一个**概念完整但基础设施欠缺**的实现。约 2,500 行代码覆盖了 Agent 注册/发现/运行/团队协作的核心模式，与完整版在 API 设计层面高度相似。但缺失了所有生产级基础设施（异步执行、上下文隔离、持久化记忆、多后端 Swarm、可观测性、生命周期 hooks），完整版等效代码分散在 ~50 个文件中，代码量约 10-15x。

**Agent 系统是 mini-v8 中最接近生产可用的模块**，差距主要在"工程基础设施"而非"核心逻辑"。
