# Memory 体系：跨会话持久化与个性化配置

## 1. 概述

Memory 体系是本项目中最复杂的子系统之一，实现了从会话级记忆 → 自动提取 → 离线巩固 → 行为反馈 → 指令注入的完整闭环，支持 C 端产品的**个性化行为配置**与**用户偏好学习**。

---

## 2. 跨会话持久化记忆

### 2.1 存储路径解析

记忆存储于 `~/.claude/projects/<sanitized-git-root>/memory/`。路径解析优先级（`src/memdir/paths.ts:223-235`）：

1. `CLAUDE_COWORK_MEMORY_PATH_OVERRIDE` 环境变量（完整路径覆盖）
2. `autoMemoryDirectory` 配置项（policy/local/user 源；出于安全考虑排除 projectSettings）
3. 默认：`<memoryBase>/projects/<sanitized-git-root>/memory/`

项目的 Git 根目录经过 `findCanonicalGitRoot()` 规范化，确保同一仓库的所有 Worktree 共享同一自动记忆目录。

### 2.2 记忆文件格式

每一条记忆是一个独立的 Markdown 文件，使用 frontmatter 描述元数据：

```markdown
---
name: <short-kebab-case>
description: <一行摘要，用于后续相关性判断>
metadata:
  type: user | feedback | project | reference
---

<记忆内容>
```

### 2.3 四种记忆内容类型

| 类型 | 说明 | 何时保存 |
|------|------|----------|
| `user` | 用户角色、目标、职责、知识水平 | 了解用户的角色偏好和背景时 |
| `feedback` | 关于工作方式的用户指导（成功+失败都要记录） | 用户纠正或确认非显而易见的做法 |
| `project` | 项目进展、目标、Bug、时间线 | 了解谁在做什么、为什么、截止日期等 |
| `reference` | 外部系统的引用位置（Linear/Slack/Grafana 等） | 了解到外部系统资源时 |

### 2.4 MEMORY.md 索引文件

`MEMORY.md` 是**索引文件而非记忆**，每行一条：
```
- [Title](file.md) -- 一行摘要
```
- 最大 200 行
- 最大 ~25KB
- 自动加载到每次会话的初始上下文

### 2.5 记忆新鲜度追踪

`src/memdir/memoryAge.ts` 提供"记忆年龄"的跟踪和展示：
- 超过 1 天的记忆会附加"新鲜度警告"
- 帮助模型判断记忆是否仍然有效

---

## 3. 自动提取（Extract Memories）

### 3.1 架构

每轮对话结束时（模型产出最终响应且无工具调用），一个 **Fork 子代理**自动分析新增消息并提取记忆。

### 3.2 触发条件

`src/query/stopHooks.ts:147-166` 中的多重门控：

1. `feature('EXTRACT_MEMORIES')` 构建时代码保留
2. 仅主代理（非子代理）
3. `isExtractModeActive()` — GrowthBook 开关 `tengu_passport_quail`
4. 非穷鬼模式（poor mode）
5. 自动记忆功能已启用
6. 非远程模式
7. 主代理未自行写入记忆文件（`hasMemoryWritesSince` 互斥检查）

### 3.3 提取代理的权限控制

`createAutoMemCanUseTool()`（`src/services/extractMemories/extractMemories.ts:170-221`）：

| 工具 | 权限范围 |
|------|----------|
| Read / Grep / Glob | 无限制 |
| Bash | 仅限只读命令 |
| Edit / Write | 仅限自动记忆目录内的路径 |
| 其他所有工具 | 拒绝 |

### 3.4 提取流程

提取代理接收：
- 最近的 N 条消息（仅 user + assistant 类型）
- 现有记忆清单（`scanMemoryFiles()` + `formatMemoryManifest()`）
- 四类型分类法及"不保存"规则

**效率策略**：Turn 1 读全文件 → Turn 2 写全文件。最大 5 轮 / 每次运行。节流：每 N 个符合条件的轮次运行一次（GrowthBook 配置，默认 1）。

---

## 4. 离线巩固（Auto-Dream）

### 4.1 系统概述

Auto-Dream 是**后台记忆巩固系统**，在用户不活跃时自动整合和优化记忆库。

**入口**：`src/services/autoDream/autoDream.ts` — 由 `src/utils/backgroundHousekeeping.ts:37` 在启动时初始化。

### 4.2 触发门控

```
Time Gate → Session Gate → Lock Gate
```

1. **时间门控**：距上次巩固 ≥ 最小时间间隔（默认 24h）
2. **会话门控**：自上次巩固后的 transcript 数 ≥ 最小会话数（默认 5）
3. **锁门控**：无其他进程在运行巩固

### 4.3 锁机制

`src/services/autoDream/consolidationLock.ts`：
- 在记忆目录中创建 `.consolidate-lock` 文件
- 文件 mtime **即** `lastConsolidatedAt` 时间戳
- 文件体包含持有者 PID
- 过期阈值 1 小时（防止 PID 重用竞态）

### 4.4 巩固四阶段

1. **Orient（定向）**：`ls` 记忆目录，阅读 `MEMORY.md`，浏览主题文件
2. **Gather（收集）**：查阅每日日志、检测漂移记忆、精确 grep transcript 文件
3. **Consolidate（巩固）**：合并新信号→更新已有主题文件、转换相对日期为绝对日期、删除被推翻的事实
4. **Prune and Index（修剪索引）**：更新 `MEMORY.md`（保持 < 200 行、~25KB）、移除过期引用

### 4.5 手动模式

- `/dream` Skill：交互式运行相同巩固 Prompt，拥有完整工具权限
- `/remember` Skill：审查所有记忆层，提出从 Auto-Memory 提升到 CLAUDE.md/CLAUDE.local.md 的建议，包含清理建议

---

## 5. Hooks 系统

### 5.1 Hook 事件类型

系统定义了 **20+ 种 Hook 事件**（`src/utils/hooks/hookEvents.ts`）：

| 事件 | 触发时机 |
|------|----------|
| `PreToolUse` / `PostToolUse` / `PostToolUseFailure` | 工具调用生命周期 |
| `UserPromptSubmit` | 用户提交 Prompt |
| `SessionStart` / `SessionEnd` | 会话生命周期 |
| `Stop` / `StopFailure` | 模型结束或失败 |
| `SubagentStart` / `SubagentStop` | 子代理生命周期 |
| `PreCompact` / `PostCompact` | 对话压缩 |
| `Notification` | 发送通知 |
| `PermissionRequest` / `PermissionDenied` | 权限事件 |
| `Setup` | 仓库初始化/维护 |
| `Elicitation` / `ElicitationResult` | MCP 发现对话框 |
| `ConfigChange` | 设置文件更改 |
| `InstructionsLoaded` | CLAUDE.md / Rules 加载 |
| `WorktreeCreate` / `WorktreeRemove` | Worktree 生命周期 |
| `CwdChanged` / `FileChanged` | 目录/文件监控 |

### 5.2 Hook 命令类型

`src/schemas/hooks.ts:31-169` 定义了 6 种命令类型：

| 类型 | 实现方式 |
|------|----------|
| `command` | Shell 命令（bash/powershell） |
| `prompt` | LLM Prompt 评估 |
| `agent` | 代理验证器 Hook |
| `http` | HTTP POST 请求 |
| `callback` | 进程内 JavaScript 回调 |
| `function` | 进程内函数 Hook |

每个 Hook 类型支持：
- 可选 `if` 条件（权限规则语法，如 `"Bash(git *)"`）
- `timeout` 超时控制
- `statusMessage` 状态提示
- `once` 模式（运行一次后自动移除）
- `async` / `asyncRewake` 模式（command 专用）

### 5.3 Hook 配置来源

`src/utils/hooks/hooksSettings.ts:92-161`：

```
userSettings      (~/.claude/settings.json)
projectSettings   (.claude/settings.json — 签入代码库)
localSettings     (.claude/settings.local.json — gitignored)
pluginHook        (来自插件)
sessionHook       (进程内内存，临时)
builtinHook       (内部注册)
policySettings    (企业托管)
```

### 5.4 Hook 执行流程

`executeHooks()`（`src/utils/hooks.ts:2088`）：
1. `getMatchingHooks()` — 从所有源汇编 Hook 列表，按匹配器过滤，去重，应用 `if` 条件
2. 安全强制（`src/utils/hooks.ts:286-297`）：交互模式下所有 Hooks 需要工作区信任，防止 `.claude/settings.json` Hook 在用户接受信任对话框前执行代码
3. Hook 结果处理：
   - 退出码 2 → 阻塞错误，注入消息继续循环
   - `updatedInput` → 替换工具输入
   - `additionalContext` → 注入下一轮 Prompt
   - `permissionDecision` → 覆盖权限决策

### 5.5 Stop Hooks 与 Background Bookkeeping

`src/query/stopHooks.ts:65-484` 在每个模型响应结束时：
1. 处理 Stop Hook（阻塞/预防逻辑）
2. 触发后台维护（Prompt 建议、记忆提取、Auto-Dream）
3. 评估 Token 预算续接条件

---

## 6. 项目级指令注入机制

### 6.1 完整的指令注入流水线

```
Managed Memory (/etc/claude-code/CLAUDE.md)
    ↓ 覆盖
User Memory (~/.claude/CLAUDE.md + rules/*.md)
    ↓ 覆盖
Project Memory (CLAUDE.md + .claude/CLAUDE.md + rules/*.md)
    ↓ 覆盖
Local Memory (CLAUDE.local.md)
    ↓ 补充
Auto Memory (~/.claude/projects/<slug>/memory/MEMORY.md)
    ↓ 补充
Team Memory (feature gated)
    ↓
最终 System Prompt 注入 + User Context 前缀
```

### 6.2 Settings 来源优先级

`src/utils/settings/constants.ts:7-22`：

```
userSettings < projectSettings < localSettings < flagSettings < policySettings
```

- 后面的源覆盖前面的源
- Policy/flag 始终包含
- user/project/local 可通过 `--setting-sources` CLI 标志禁用
- 合并使用 `lodash-es/mergeWith()` 实现嵌套对象深度合并

### 6.3 条件规则系统

`.claude/rules/*.md` 通过 frontmatter `paths:` 字段实现**路径限定的条件加载**，仅在当前操作文件匹配 glob 模式时激活。

### 6.4 Enterprise 托管设置

`managed-settings.json` + `managed-settings.d/*.json` 文件（按字母排序，后加载的文件优先）支持独立团队策略片段的声明式组合。

---

## 7. 用户偏好学习

### 7.1 Feedback Memory 类型

`feedback` 记忆类型用于记录用户工作方式偏好：

> **格式**：先写规则本身，然后 **Why:**（原因 — 通常是过往事故或强偏好）和 **How to apply:**（何时/何场景应用此指导）

关键原则：不仅记录**失败**（纠正），更记录**成功**（确认），通过双重来源持续精细化行为：

| 来源 | 例子 |
|------|------|
| 失败纠正 | "不要 mock 数据库" → 上次 mock/prod 分叉导致迁移失败 |
| 成功确认 | "单个打包 PR 是正确的" → 经实践验证的判断 |

### 7.2 技能自动改进

`src/utils/hooks/skillImprovement.ts` 实现了**自动技能改进机制**：
- 监控技能执行过程中的用户纠正和偏好表达
- 每 5 轮触发一次（可配置）
- 分析用户消息中的 "add/change/remove steps"、"no, do X instead"、"always use Y" 等信号
- 生成 `SkillUpdate[]` 元数据（section + change + reason）
- 通过侧信道 LLM 调用自动重写 SKILL.md 文件

这是 **人类反馈 → 永久技能定义** 的自动化闭环。
