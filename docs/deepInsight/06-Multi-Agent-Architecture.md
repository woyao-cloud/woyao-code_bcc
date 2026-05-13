# 多 Agent 协作架构设计

## 1. 概述

本项目实现了三种独立的多 Agent 协作模式——**Fork 子代理**、**AgentTool 嵌套**和 **Coordinator 模式**，三者形成互补关系：Fork 追求极致的 Prompt Cache 复用效率，AgentTool 提供通用灵活的子代理创建能力，Coordinator 专注于大规模协调场景中的工作分配与合并。

三者的互斥关系：
- Coordinator Mode 激活时 → Fork 子代理被禁用（协调器已承担编排职责）
- Fork 路径激活时 → 所有 Agent spawn 强制异步，绕过常规 Agent 注册机制
- 常规 Agent 路径 → 通过 Type Registry 匹配已注册代理

---

## 2. Fork 子代理系统

### 2.1 设计目标

Fork 子代理的核心理念是：**多个子任务共享同一个 Prompt Cache 前缀**。通过让所有 Fork 子节点拥有完全相同的消息前缀，最大化 API 端的 Prompt Cache 命中率，大幅降低 Token 消耗。

### 2.2 启用条件

`packages/builtin-tools/src/tools/AgentTool/forkSubagent.ts:32-39` 中 `isForkSubagentEnabled()` 需三个条件同时满足：

1. `feature('FORK_SUBAGENT')` 构建时开启
2. **非** Coordinator 模式
3. **非**非交互式会话（SDK/pipe 模式）

### 2.3 Fork Agent 定义

`forkSubagent.ts:60-71` 定义了 `FORK_AGENT`——一个内联的合成代理定义：

| 属性 | 值 | 说明 |
|------|-----|------|
| `tools` | `['*']` | 继承父代理工具 |
| `maxTurns` | 200 | 充足的自主执行轮次 |
| `model` | `'inherit'` | 与父代理同模型保证缓存兼容 |
| `permissionMode` | `'bubble'` | 权限请求冒泡到父终端 |
| `source` | `'built-in'` | 非标准 Agent Registry 注册 |

**不在**正常 Agent Registry 中——仅通过 Fork 路径引用。

### 2.4 消息构建与 Cache 共享

`buildForkedMessages()`（`forkSubagent.ts:107-175`）：

```
消息结构：
  [...父对话历史]
  + 完整 Assistant 消息（含所有 tool_use 块）
  + 用户消息（所有工具调用统一占位符 "Fork started -- processing in background"）
  + 逐子节点指令文本

效果：所有 Fork 子节点的前缀（到指令文本前）完全相同 → 共享 Prompt Cache
```

### 2.5 递归 Fork 保护

**两层守卫**：
1. 主守卫（`AgentTool.tsx:424-430`）：检查 `toolUseContext.options.querySource === 'agent:builtin:fork'`
2. 回退守卫（`forkSubagent.ts:78-89`）：扫描消息中是否存在 `<fork-boilerplate>` XML 标签

### 2.6 Fork 子节点行为规约

`buildChildMessage()`（`forkSubagent.ts:177-204`）包含 10 条不可协商规则：
- "你**是** fork 子节点。不要生成子代理；直接执行。"
- "不要对话、提问或建议下一步。"
- "如果修改了文件，在报告前提交更改。"
- "响应必须以 'Scope:' 开头。"

### 2.7 Worktree 集成

可选的 Worktree 隔离模式——子代理在独立工作目录中操作。`buildWorktreeNotice()` 附加路径转换通知指导继承路径的翻译和重新读取。

---

## 3. AgentTool 实现

### 3.1 工具入口

`packages/builtin-tools/src/tools/AgentTool/AgentTool.tsx:284`：
- `name: 'Agent'`（旧别名：`Task`）
- `buildTool()` 标准化定义，含完整的权限校验和生命周期管理

### 3.2 输入 Schema

**基础参数**（`baseInputSchema()`）：
- `description`（必填）— 子代理任务简述
- `prompt`（必填）— 完整任务描述
- `subagent_type`（可选）— 指定代理类型
- `model`（可选）— 模型覆盖
- `run_in_background`（可选）— 异步执行

**扩展参数**（`fullInputSchema()`）：
- `name` + `team_name` — 多代理 swarm 路径
- `isolation` — 隔离模式（Worktree 等）
- `cwd` — 工作目录覆盖

Schema 字段根据 Feature Flag 动态省略（Fork 开启时隐藏 `run_in_background`，非 KAIROS 隐藏 `cwd` 等）。

### 3.3 路由逻辑

`call()` 方法（AgentTool.tsx:322-458）的核心路由：

```
1. team_name + name 均提供
   → spawnTeammate()（多代理 swarm 路径），直接返回

2. 否则，决策 effectiveType：
   - 提供了 subagent_type → 直接使用
   - 未提供 + Fork 开启 → undefined（Fork 路径）
   - 未提供 + Fork 关闭 → 'general-purpose'（回退）

3. Fork 路径：
   - selectedAgent = FORK_AGENT
   - 检查递归 Fork 守卫
   - 工具池 = filterParentToolsForFork(parentTools)

4. 非 Fork 路径：
   - 在 activeAgents 中搜索匹配类型
   - 被权限规则拒绝 → 抛出（含来源信息）
```

### 3.4 工具池组装

`AgentTool.tsx:722-726`：
- 子代理的工具池通过 `assembleToolPool()` 独立组装
- 使用子代理**自己的权限模式**（默认 `acceptEdits`）
- 完全独立于父代理的工具限制

### 3.5 异步执行判定

`shouldRunAsync` 由以下条件共同决定：
- `run_in_background` 参数
- Agent 定义的 `background: true`
- Coordinator 模式
- Fork gate 的 `forceAsync`
- Assistant/Kairos 模式

Fork 路径下所有 Agent spawn 强制异步，统一通过 `<task-notification>` XML 消息交互。

### 3.6 上下文边界

非 Fork 代理从**零上下文**开始——仅接收 `prompt` 参数作为用户消息，不携带父对话的任何历史。Agent 被指示为"刚走进房间的聪明同事"——不知道当前对话的任何上下文。

Fork 代理携带父代理的完整对话历史（`forkContextMessages`）。

---

## 4. Coordinator 模式

### 4.1 设计理念

Coordinator Mode 将主代理剥离所有"实操工具"（读文件/写代码/执行命令），仅保留：
```
Agent, SendMessage, TaskStop, SyntheticOutput
```
（`src/constants/tools.ts:123-128`: `COORDINATOR_MODE_ALLOWED_TOOLS`）

协调器只负责**委派和管理**，所有实际工作由 Worker 代理执行。

### 4.2 四阶段工作流

| 阶段 | 执行者 | 目的 |
|------|--------|------|
| Research（研究）| Workers（并行）| 调查代码库、定位关键文件 |
| Synthesis（综合）| Coordinator | 阅读发现，撰写规范 |
| Implementation（实现）| Workers | 针对性修改，提交 |
| Verification（验证）| Workers | 测试变更是否有效 |

### 4.3 核心约束："永远不要委派理解"

反模式：`"based on your findings, fix the bug"`（将综合判断推给 Worker）
正确模式：协调器先**理解**发现，再写出具体的文件路径、行号和确切变更描述。

### 4.4 Worker 续接 vs 新建决策矩阵

| 场景 | 决策 | 原因 |
|------|------|------|
| 在需要编辑的确切文件上调研 | Continue | 上下文已建立 |
| 宽泛调研 → 窄实现 | Spawn Fresh | 新上下文更聚焦 |
| 纠正失败 | Continue | 保持错误上下文 |
| 验证另一个 Worker 的代码 | Spawn Fresh | 独立视角 |
| 方法完全错误 | Spawn Fresh | 全新上下文 |

### 4.5 Worker Agent 实现

`src/coordinator/workerAgent.ts:41-67`：
- `agentType: 'worker'`
- 工具：`ASYNC_AGENT_ALLOWED_TOOLS` 减去 `INTERNAL_ORCHESTRATION_TOOLS`（TeamCreate/TeamDelete/SendMessage/SyntheticOutput）
- Coordinator 模式下替换所有内置代理（`getBuiltInAgents()` 仅返回 `WORKER_AGENT`）

### 4.6 Scratchpad — 跨 Worker 知识共享

GrowthBook 标志 `tengu_scratch` 启用时，Worker 获得一个免权限的读/写目录。Worker A 的研究成果可直接被 Worker B 读取，无需经过 Coordinator。

### 4.7 与 Fork 子代理的互斥

`forkSubagent.ts:34`：`if (isCoordinatorMode()) return false` — 两个模式明确互斥。

---

## 5. 并发子任务

### 5.1 并行执行原则

系统明确鼓励并行：
> "Launch multiple agents concurrently whenever possible, to maximize performance; to do that, use a single message with multiple tool uses."

- **只读任务**：自由并行
- **写重任务**：按文件集串行
- **验证 + 实现**：不同文件区域可并行

### 5.2 并发管理

所有 Fork 模式代理强制异步，通过 `<task-notification>` XML 队列与主代理通信。通知默认优先级 `later`（不抢占用户输入），支持优先级队列管理（`src/utils/messageQueueManager.ts`）。

### 5.3 进程内协作工具

Swarm 模式下，提供额外的工具支持：
- `TaskCreate` / `TaskGet` / `TaskList` / `TaskUpdate` — 任务生命周期管理
- `SendMessage` — 代理间消息传递
- `CronCreate` / `CronDelete` / `CronList` — 定时调度

`claimTask()` 是基于**文件锁**的核心并发原语，通过原子获取防止重复分配。

---

## 6. Agent 类型与注册体系

### 6.1 内置代理一览

| 代理类型 | 特性 |
|----------|------|
| `general-purpose` | 全工具访问，通用默认代理，用于研究/搜索/多步骤任务 |
| `Explore` | 只读文件搜索专家；禁止 Edit/Write/Agent；模型继承或 Haiku 回退；`omitClaudeMd: true` |
| `Plan` | 软件架构师，只读规划；禁止 Edit/Write/Agent；`omitClaudeMd: true` |
| `statusline-setup` | 专用终端状态栏配置 |
| `claude-code-guide` | Claude Code 使用指导（非 SDK 场景） |
| `verification` | `VERIFICATION_AGENT` feature gate + GB flag 双重门控 |

### 6.2 代理定义类型层级

- `BaseAgentDefinition`：通用字段（agentType, tools, disallowedTools, skills, mcpServers, hooks, model, permissionMode, maxTurns, isolation, omitClaudeMd 等）
- `BuiltInAgentDefinition`：`source: 'built-in'` + `getSystemPrompt(params)` 方法
- `CustomAgentDefinition`：用户/项目/策略代理，闭包 `getSystemPrompt()`，`source: SettingSource`
- `PluginAgentDefinition`：`source: 'plugin'` + Plugin 元数据

### 6.3 代理发现与优先级

`getAgentDefinitionsWithOverrides()` 从以下源加载：
1. 内置定义
2. Markdown 文件（`agents/` 子目录）
3. 插件

合并优先级：**built-in > plugin > user > project > flag > managed**，按 `agentType` 去重。

---

## 7. Agent 通信模式

### 7.1 三种通信机制

**同步工具结果**：父代理的 Agent 工具调用阻塞直到子代理完成。结果作为当前轮的 `tool_result` 块返回，父模型在**下一轮**的上下文中看到。

**异步任务通知队列**：后台代理通过 `enqueueAgentNotification()` 产出 `<task-notification>` XML 消息。这些消息作为 user-role 消息注入轮间，协调器/父代理通过 `<task-notification>` 标签开头区分真实用户输入。

**Mailbox（Swarm）**：进程内队友通过共享 Mailbox 通信：
- `message` → 定向发送
- `broadcast` → 全体广播
- `TeammateIdle` → 队友完成全部任务时自动通知
- 权限同步 → 队友可通过邮箱向 Leader 请求权限决策

### 7.2 SendMessage Tool

支持通过 `name` 或 `agentId` 向运行中或已停止的代理发送后续消息：
- 运行中的代理：消息排队到 `pendingMessages`，在循环边界交付
- 已停止的代理：从 Sidechain Transcript 恢复并继续执行

---

## 8. 工具权限范围控制

### 8.1 权限模式继承

子代理的 `getAppState()` 被包装以覆盖 Agent 定义中的权限模式。父代理为 `bypassPermissions` 或 `acceptEdits` 时优先。默认权限模式：`acceptEdits`。

### 8.2 所有子代理禁用的工具

`ALL_AGENT_DISALLOWED_TOOLS`（`src/constants/tools.ts:44-62`）：
```
TaskOutput, ExitPlanMode, EnterPlanMode, Agent, AskUserQuestion,
TaskStop, Workflow, LocalMemoryRecall, VaultHttpFetch
```

### 8.3 异步代理工具白名单

`ASYNC_AGENT_ALLOWED_TOOLS`（`src/constants/tools.ts:71-87`）：
```
Read, WebSearch, TodoWrite, Grep, WebFetch, Glob, Bash/Shell,
Edit, Write, NotebookEdit, Skill, SyntheticOutput, SearchExtraTools,
EnterWorktree, ExitWorktree
```

### 8.4 Coordinator Worker 限制

Worker 工具排除了 `INTERNAL_ORCHESTRATION_TOOLS`（TeamCreate/TeamDelete/SendMessage/SyntheticOutput），防止递归编排。

### 8.5 自定义代理额外限制

`CUSTOM_AGENT_DISALLOWED_TOOLS` 是在 `ALL_AGENT_DISALLOWED_TOOLS` 基础上的**超集**，对用户创建的代理施加更严格的默认限制。

---

## 9. 设计权衡

### 9.1 Fork vs Agent vs Coordinator 的选择

| 场景 | 推荐模式 | 原因 |
|------|----------|------|
| 高度并行的独立读/写任务 | Fork | Cache 共享最大化 |
| 通用子代理（研究/搜索/实现） | Agent (general-purpose) | 灵活、类型安全 |
| 大规模多功能协调 | Coordinator | 角色分离清晰 |
| 单步专业任务（探索/规划） | Agent (Explore/Plan) | 类型安全，无上下文 |  | |

### 9.2 上下文隔离策略

- Fork 子代理 → 携带父代理完整上下文（Cache 共享优先）
- 非 Fork 子代理 → 零上下文启动（仅 prompt，隔离优先）
- Coordinator Worker → 协调器提供具体指令（"永不委派理解"原则）
