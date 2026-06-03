# 第 7 章：多 Agent 协作架构

## 7.1 概述

单一 Agent 的能力受限于模型的单次推理能力和有限的 Context 窗口。为了处理更复杂的任务，项目构建了多 Agent 协作架构，支持多种协作模式：

- **嵌套模式**：主 Agent 调用子 Agent 处理子任务
- **分支模式**：以 Fork 方式创建独立的子 Agent 并行执行
- **团队模式**：多个 Agent 作为团队成员协同工作
- **并发模式**：多个 Task 同时运行并在主循环中收集结果

## 7.2 AgentTool：嵌套子 Agent

### 设计原理

AgentTool 是系统中最强大的工具之一。当主 Agent 认为自己需要一个独立的"助手"来并行探索某个方向时，可以调用 AgentTool 来启动一个子 Agent。

子 Agent 的运行方式是：
1. 主 Agent 在对话中输出一个 AgentTool 调用（包含 Agent 类型和任务描述）
2. 系统接收这个调用，创建一个全新的 Agent 实例
3. 新 Agent 拥有自己的对话历史、自己的 System Prompt、自己的工具列表
4. 子 Agent 独立运行，完成自己的 Agent 循环
5. 子 Agent 完成后，将结果返回给主 Agent 的上下文

### Agent 类型系统

系统预定义了多种 Agent 类型，每种有专门的 System Prompt 和工具集：

- **general-purpose**：通用 Agent，拥有完整的工具集
- **Explore Agent**：只读搜索 Agent，用于代码库探索
- **Plan Agent**：规划 Agent，专注任务分解和计划制定
- **Claude Code Guide Agent**：文档问答 Agent，专注回答 Claude Code 的使用问题
- **用户自定义 Agent**：通过配置文件定义的自定义类型

### 工具隔离

子 Agent 不会继承主 Agent 的全部工具。AgentTool 的 resolveAgentTools 函数根据以下规则过滤工具：
1. 根据 Agent 的来源（内置/插件）过滤
2. 应用该 Agent 类型的 disallowedTools 列表
3. 如果是异步模式（Async），进一步限制工具集

这种隔离确保了子 Agent 不会滥用主 Agent 的权限。

### 结果回传

子 Agent 的执行结果通过 tool_result 机制回传给主 Agent。主 Agent 将其视为一次普通的工具调用，可以基于结果决定下一步行动。

## 7.3 Fork 子 Agent

### 设计原理

Fork 子 Agent 是一种更轻量的 Agent 派生方式。与 AgentTool 不同，Fork 子 Agent 共享主 Agent 的 System Prompt 前缀，以利用 Prompt Cache：

- **缓存效率**：子 Agent 的 System Prompt 前缀与主 Agent 相同，API 服务器直接命中缓存
- **独立上下文**：子 Agent 拥有独立的消息列表，不污染主 Agent 的 Context
- **结果替换**：子 Agent 在运行时，主 Agent 的工具调用结果通过 parentToolResultReplacements 映射传递给子 Agent

### ForkSubagent 模块

ForkSubagent 包含以下核心能力：

**Fork 配置**：
- enabled：是否启用 Fork 模式
- isolation：隔离模式（process / worktree）
- maxTurns：子 Agent 的最大轮次

**Worktree 隔离**：当 isolation 设置为 "worktree" 时，项目会创建一个临时的 Git Worktree，子 Agent 在其中独立修改文件，不影响主工作区：
1. 基于当前分支创建新的 Worktree
2. 将子 Agent 的工作目录指向 Worktree
3. 子 Agent 完成后收集结果
4. 自动清理 Worktree

**父结果替换**：子 Agent 启动时，系统从主 Agent 的对话消息中提取所有 tool_result 块，构建一个 ID → 内容的映射表。子 Agent 运行过程中如果遇到了这些 ID 的工具结果，可以直接使用预填充的内容，无需实际执行工具。

### 典型使用场景

Fork 子 Agent 常用于以下场景：
- **记忆提取**：在后台 Fork 一个子 Agent，让其在对话历史中提取值得记忆的信息
- **Prompt 建议生成**：Fork 子 Agent 分析当前状态，生成下一轮输入建议
- **并行探索**：多个 Fork 同时探索不同的代码库区域

## 7.4 团队协作模式（Teammate）

### 设计原理

团队协作模式允许多个 Agent 作为"团队成员"在同一任务中协作。每个成员有独立的 Identity（名称、颜色、角色）和独立的对话历史。

### 团队管理

TeamManager 模块负责团队的生命周期管理：
- **创建团队**：通过 AgentTool 的 spawnTeam 操作创建
- **添加成员**：向已有团队添加新成员
- **移除成员**：从团队中移除退出成员
- **解散团队**：任务完成后销毁团队

每个团队成员都有一个唯一的 AgentId，格式为 `{name}-{teamName}`，确保全局唯一性。

### 通信机制：TeammateMailbox

团队成员之间通过"邮箱"（Mailbox）机制通信，而非共享对话历史：

**消息模型**（TeammateMessage）：
- from：发送方名称
- text：消息内容
- timestamp：时间戳
- read：是否已读标记
- color：发送方颜色（用于 UI 区分）
- summary：消息摘要（可选，5-10 字）

**发送流程**：
1. 发送方调用 SendMessageTool，指定接收方名称
2. 系统将消息写入接收方的邮箱文件
3. 接收方在下一次查询前检查邮箱
4. 接收方读取新消息并处理

**广播机制**：
- 发送方可以广播消息给所有成员
- 广播遍历团队成员列表，逐人写入邮箱
- 每条消息独立存储，不共享

**文件锁**：邮件文件的写操作使用文件锁（lockfile）保证原子性，避免并发写入冲突。

### In-Process Teammate

In-Process Teammate 是一种在同一个进程内运行的团队成员。它的特点是：
- 独立的 AbortController（不随主 Agent 的中断而中止）
- 在 AppState 中注册为独立任务
- 在 Perfetto 追踪中形成父子 Agent 关系
- 支持 cleanup 注册表，进程退出时自动清理

### 团队上下文

TeamContext 在团队成员之间传递共享信息：
- teamName：团队名称
- members：成员列表
- sharedState：共享状态（有限）

## 7.5 并发子任务（Task 系统）

### Task 模型

Task 是多 Agent 协作的另一种形式，适用于"一次启动多个独立任务，逐批收集结果"的场景。

Task 的基本模型包含：
- id：唯一标识
- title：标题
- description：详细描述
- status：状态（pending / running / completed / failed）
- result：执行结果
- createdAt / updatedAt：时间戳

### Task 生命周期

1. **创建**：主 Agent 通过 TaskCreateTool 创建任务（指定标题、描述）
2. **并发执行**：多个 Task 同时运行，每个 Task 可能有独立的子 Agent
3. **状态查询**：主 Agent 通过 TaskListTool / TaskGetTool 查询任务状态
4. **结果收集**：任务完成后，结果通过 TaskUpdateTool 更新
5. **汇总**：主 Agent 收集所有 Task 的结果并决策下一步

### 与 AgentTool 的关系对比

| 维度 | AgentTool 嵌套 | Task 并发 |
|------|---------------|-----------|
| 执行方式 | 串行等待子 Agent 完成 | 并发执行多个任务 |
| 结果收集 | 通过 tool_result 返回 | 通过 Task API 查询 |
| Context 隔离 | 子 Agent 独立 | 每个 Task 独立 |
| 适用场景 | 单一子任务 | 多个独立子任务并行 |

## 7.6 协调器模式（Coordinator Mode）

### 设计原理

Coordinator Mode 是一种更高级的多 Agent 协作模式，适用于"一个协调器 + 多个 Worker"的架构。协调器负责任务拆分、分配和结果合并，Worker 负责实际执行。

### 模式切换

系统通过 `matchSessionMode` 判断是否处于 Coordinator 模式。当启用时：
1. 主 Agent 以协调器身份启动
2. 协调器负责理解用户需求，拆分为子任务
3. 协调器通过 AgentTool 或 Task 系统分配任务
4. Worker 执行子任务并返回结果
5. 协调器合并结果并生成最终输出

## 7.7 Fork vs. AgentTool vs. Teammate 的选择

当面对多 Agent 需求时，系统根据以下因素选择协作模式：

```
任务类型                 → 选择
┌──────────────────────┐
│ 单一子任务             → AgentTool 嵌套
│ 并发独立子任务          → Task 并发
│ 后台轻量级处理          → Fork 子 Agent
│ 长期团队协作            → Teammate 团队
│ 协调器 + 多个 Worker   → Coordinator Mode
└──────────────────────┘
```

选择的核心权衡：
- **资源消耗**：Fork < AgentTool < Task < Teammate（从左到右递增）
- **隔离程度**：Fork < AgentTool < Task < Teammate（从左到右递增）
- **通信开销**：AgentTool（直接返回）< Task（轮询查询）< Teammate（邮箱通信）

## 7.8 设计权衡总结

| 维度 | 方案 | 考量 |
|------|------|------|
| 协作模式 | 4 种模式并存 | 灵活但增加了用户选择负担 |
| Agent 隔离 | 独立消息列表 + 工具过滤 | 保证安全但增加了内存开销 |
| 进程隔离 | Worktree + Process | Worktree 安全但操作慢，Process 快但有安全风险 |
| 通信机制 | Mailbox 异步消息 | 解耦但增加了延迟 |
| 并行度 | Task 并发执行 | 需要协调器聚合结果 |
| Cache 利用 | Fork 共享前缀缓存 | 子 Agent 与主 Agent 解耦越强，共享缓存越少 |
