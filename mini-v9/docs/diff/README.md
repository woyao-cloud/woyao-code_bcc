# Mini-v9 vs Main Project 差异分析报告

> 生成日期: 2026-05-27
> 对比对象: `src/` (main, ~2705 entries) vs `mini-v9/src/` (mini-v9, ~204 files)

---

## 目录

1. [总体概览](#1-总体概览)
2. [文件结构差异](#2-文件结构差异)
3. [依赖与构建差异](#3-依赖与构建差异)
4. [入口与CLI架构](#4-入口与cli架构)
5. [核心引擎对比](#5-核心引擎对比)
6. [Tool 系统对比](#6-tool-系统对比)
7. [Service 层对比](#7-service-层对比)
8. [Agent/Team/Plan 系统对比](#8-agentteamplan-系统对比)
9. [UI/渲染对比](#9-ui渲染对比)
10. [mini-v9 独有的功能](#10-mini-v9-独有的功能)
11. [main 有而 mini-v9 没有的功能](#11-main-有而-mini-v9-没有的功能)
12. [总结与建议](#12-总结与建议)

---

## 1. 总体概览

| 维度 | Main (完整版) | Mini-v9 | 差距 |
|------|---------------|---------|------|
| 源码文件数 | ~2705 | ~204 | **-2501 (92.5%)** |
| 顶层目录数 | 57 | 43 | -14 |
| 依赖包数 | 140 | 5 | **-135 (96.4%)** |
| npm scripts | 26 | 4 | -22 |
| Workspace 包 | 15 | 0 | **-15** |
| 测试文件 | ~450+ | 42 | -90%+ |
| 行数估计 | ~300,000+ | ~30,000 | -90% |

**核心理念**:
- **Main**: 完整反编译 Anthropic Claude Code CLI，保留全部功能，React/Ink UI，15 个 workspace 包
- **Mini-v9**: 极简重构版，去掉 Ink UI/dependency-heavy 组件，核心逻辑 ~30K 行

---

## 2. 文件结构差异

### main 有、mini-v9 完全删除的目录 (21个)

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `src/components/` | ~400+ | Ink UI 组件（消息渲染、权限对话框、Spinner、Help、Logo 等） |
| `src/screens/` | 3 | 全屏组件（REPL, Doctor, ResumeConversation） |
| `src/hooks/` | ~100+ | React hooks（权限、键盘、MCP、设置、语音等） |
| `src/keybindings/` | ~20 | 键盘绑定系统 |
| `src/context/` | ~10 | React Context providers |
| `src/bridge/` | ~40 | Remote Control / Bridge 模式 |
| `src/daemon/` | 5 | Daemon 模式 |
| `src/buddy/` | 9 | Buddy 同伴系统 |
| `src/assistant/` | 6 | Assistant 会话管理 |
| `src/coordinator/` | 2 | 协调器模式 |
| `src/proactive/` | 3 | 主动通知 |
| `src/remote/` | 4 | 远程会话管理 |
| `src/server/` | 12 | 直连服务器 |
| `src/jobs/` | 5 | 模板作业系统 |
| `src/ssh/` | - | SSH 会话 |
| `src/vim/` | - | Vim 模式 |
| `src/voice/` | - | 语音模式 |
| `src/upstreamproxy/` | - | 上游代理 |
| `src/moreright/` | 1 | MoreRight 组件 |
| `src/outputStyles/` | 1 | 输出样式加载 |
| `src/migrations/` | 9 | 设置迁移 |
| `packages/` (15个) | ~2000+ | 全部 workspace 包 |

### mini-v9 有、main 没有的目录 (8个)

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `src/services/config/` | 1 | 集中配置管理 |
| `src/services/context/` | 1 | 上下文缓存状态 |
| `src/services/cron/` | 1 | 调度器 |
| `src/services/memory/` | 7+3 | 独立内存系统 |
| `src/services/messages/` | 1+1 | 消息投影 |
| `src/services/permission/` | 4 | 权限系统 |
| `src/services/session/` | 1+1 | 会话存储 |
| `src/services/skill/` | 3 | 技能加载管理 |
| `src/ui/` | 9 | 纯终端 UI |

---

## 3. 依赖与构建差异

### 依赖对比

```
Main:  @anthropic-ai/sdk, chalk, cli-highlight, @agentclientprotocol/sdk,
       @claude-code-best/mcp-chrome-bridge, highlight.js, ws,
       + 127 devDependencies (React, Ink, AWS SDK, OpenTelemetry, Sentry,
         Langfuse, Vite, Biome, Husky, +100 more)
       + 15 workspace packages
       + 1 optional dependency (doubaoime-asr)

Mini:  @anthropic-ai/sdk, chalk, cli-highlight
       + 2 devDependencies (@types/bun, typescript)
```

**Mini-v9 移除的关键依赖**:
- React 19 + react-reconciler + Ink → 替换为纯终端 UI
- AWS SDK (`@aws-sdk/*`) → 无 Bedrock provider
- OpenTelemetry + Sentry + Langfuse → 无遥测/APM
- Biome + Husky + lint-staged → 无 lint/format
- Vite + Rollup → 改为 Bun build
- Sharp + audio-capture-napi + image-processor-napi → 无原生模块
- MCP SDK + ws → 简化版 MCP client
- Zod → 无 schema 验证库

### 构建差异

| 方面 | Main | Mini-v9 |
|------|------|---------|
| 构建工具 | Bun build + Vite (双构建系统) | 仅 Bun build |
| 构建复杂度 | `build.ts` 含代码分割、Bun→Node 兼容后处理 | 一行命令 `bun build src/entrypoints/cli.ts` |
| Dev mode | `scripts/dev.ts` 通过 `-d` flag 注入 MACRO defines | 直接 `bun run src/entrypoints/cli.ts` |
| Feature flags | 19 个 build-time + 运行时 feature flag 系统 | 无 feature flags |
| 输出产物 | `dist/cli.js` + chunk 文件 | 单一输出 |

### tsconfig 差异

| 选项 | Main | Mini-v9 |
|------|------|---------|
| target | ESNext | ES2022 |
| module | ESNext | ES2022 |
| paths | 5 个 workspace 别名 + src/* | 仅 src/* |
| include | src/**/*.{ts,tsx} + packages/**/*.{ts,tsx} | 仅 src/**/*.ts |
| 基文件 | 继承 tsconfig.base.json | 独立配置 |

---

## 4. 入口与 CLI 架构

| 方面 | Main (`cli.tsx`, 382行) | Mini-v9 (`cli.ts`, 381行) |
|------|-------------------------|---------------------------|
| 导入方式 | 全部动态 `await import()` | 全部静态 import |
| Fast paths | 10+ (version, dump-prompt, chrome-mcp, daemon, remote-control, etc.) | 无 |
| 扩展名 | `.tsx` (含 JSX) | `.ts` |
| 入口流程 | CLI 解析 → 快速路径判断 → main.tsx (Commander.js) | 直接走完整流程 |

**Main 额外 Fast Paths** (mini-v9 全部没有):
- `--dump-system-prompt` / `-v` / `--version`
- `--claude-in-chrome-mcp` / `--chrome-native-host`
- `--computer-use-mcp`
- `--daemon-worker=<kind>`
- `remote-control` / `remote` / `sync` / `bridge`
- `daemon` [subcommand]
- `ps` / `logs` / `attach` / `kill` / `--bg`
- `new` / `list` / `reply` (template jobs)
- `environment-runner` / `self-hosted-runner`
- `--tmux` + `--worktree`
- `--bare` mode

**Main 的 `main.tsx`** (~6981 行) 基于 Commander.js，注册 30+ subcommands：
```
mcp, server, ssh, open, auth, plugin, agents, auto-mode, doctor, update, ...
```
mini-v9 没有这些 subcommands，功能通过 slash 命令实现。

---

## 5. 核心引擎对比

### `QueryEngine.ts`

| 方面 | Main (1365行) | Mini-v9 (101行) |
|------|---------------|-----------------|
| Config 字段 | 25+ | 5 |
| 状态管理 | 文件历史快照、归因、权限拒绝、使用跟踪、compact boundary | abortController, token 计数, turnCount |
| 特征门控 | HISTORY_SNIP, COORDINATOR_MODE | 无 |
| `submitMessage()` | 完整对话生命周期 | 直接委托给 `query()` |

### `query.ts`

| 方面 | Main (2042行) | Mini-v9 (579行) |
|------|---------------|-----------------|
| 循环方式 | 递归状态机 (`queryLoop`) | 简单 `while(true)` |
| Generator event types | 20+ | 8 |
| 自动 compact | ✅ | ✅ (简化) |
| Thinking blocks | ✅ | ❌ |
| Token budget | ✅ | ❌ |
| Context collapse | ✅ | ❌ |
| Cache break detection | ✅ | ❌ |
| Langfuse tracing | ✅ | ❌ |
| 后台任务摘要 (BG_SESSIONS) | ✅ | ❌ |
| Snip compacting (HISTORY_SNIP) | ✅ | ❌ |
| max_output_tokens recovery | ✅ | ❌ |
| Stream watchdog | ❌ | ✅ (30s stall / 90s timeout) |

### `context.ts`

| 方面 | Main (189行) | Mini-v9 (1186行) |
|------|-------------|------------------|
| 导出函数 | 5 | 17 |
| 缓存 | lodash memoize (简单) | 自定义 TTL-based LRU (24 entry, 15s TTL) |
| Context 块类型 | 3 (git, claude.md, date) | 10+ (date, workingDir, git, claudeMd, skills, memories, sessionMemory, teamMemory, agents, teams, environment, planMode) |
| Token-aware 渲染 | ❌ | ✅ (`renderToFit`) |
| 上下文告警 | ❌ | ✅ |

---

## 6. Tool 系统对比

### `Tool.ts`

| 方面 | Main (813行) | Mini-v9 (470行) |
|------|-------------|-----------------|
| Tool 类型 | 复杂泛型 `Tool<P,I,O>` + Zod v4 | 简单 interface |
| `Tools` 类型 | `readonly Tool[]` | `Map<string, Tool>` |
| `ToolUseContext` | 30+ 字段 | 6 字段 |
| `buildTool()` | 复杂泛型转换 | 简单必填字段校验 |
| 工具注册表 | 无 | 完整注册系统 (register/unregister/find) |
| 执行历史 | 无 | ✅ 有 |
| 分类 | 无 | `getToolsByCategory()` |

### `tools.ts`

| 方面 | Main (419行) | Mini-v9 (166行) |
|------|-------------|-----------------|
| 工具来源 | `@claude-code-best/builtin-tools` 外部包 | `./builtin/` 本地目录 |
| Feature gating | 15 个条件 `require()` | 无，全部始终可用 |
| 权限过滤 | `filterToolsByDenyRules()` | 无 |
| REPL 模式隐藏 | ✅ | ❌ |
| MCP 注册 | ❌ | `registerMCPTools()` |

### Tool 实现差异

mini-v9 有 37 个内置工具 (全部本地实现)，main 在 `packages/builtin-tools/src/tools/` 中有 59 个工具目录。

**Main 有、mini-v9 没有的工具**:
| 工具 | 说明 |
|------|------|
| REPLTool | REPL 环境交互 |
| WebBrowserTool | 浏览器工具 |
| CtxInspectTool | 上下文检查 |
| BriefTool | 简报警告 |
| LocalMemoryRecallTool | 本地记忆 |
| SleepTool | 睡眠 |
| SyntheticOutputTool | 合成输出 |
| TaskOutputTool | 任务输出 |
| TaskStopTool | 任务停止 |
| WebSearchTool | 网络搜索 |
| WebFetchTool | 网页抓取 |

**Mini-v9 有、main 没有的工具**:
| 工具 | 说明 |
|------|------|
| WorkflowTool | 多阶段工作流 (全新概念) |
| TeamCreateTool | 团队创建 |
| TeamDeleteTool | 团队删除 |
| SendMessageTool | 发送消息 |
| AskUserQuestionTool | 询问用户 |
| SendUserFileTool | 发送文件 |

---

## 7. Service 层对比

### 共同子目录对比

| 目录 | Main 文件数 | Mini-v9 文件数 | Mini 精简掉的关键文件 |
|------|------------|---------------|---------------------|
| `api/` | 26 | 3 | bedrockClient, grok, adminRequests, filesApi, usage, bootstrap, errors, cacheBreak, logging 等 |
| `compact/` | 17 | 12 | compact.ts, grouping.ts, microCompact.ts, compactWarning*, timeBasedMCConfig |
| `lsp/` | 9 | 2 | LSPClient, LSPDiagnosticRegistry, LSPServerInstance/Manager, types |
| `mcp/` | 24 | 1 | auth, channel*, claudeai, config, oauth, registry, types, 全部 UI 相关 |
| `tools/` | 5 | 2 | StreamingToolExecutor, toolHooks |
| `searchExtraTools/` | 3 | 3 | prefetch.ts (被 localSearch.ts 替代) |

### Main 独有的 Service 子目录 (25个)

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `acp/` | 6+4 | Agent Client Protocol (agent, bridge, permissions, promptConversion) |
| `AgentSummary/` | 3+1 | Agent 对话摘要 |
| `analytics/` | 9 | Datadog/FirstParty/GrowthBook 遥测 |
| `auth/` | 2+1 | 认证 (hostGuard, saveWorkspaceKey) |
| `autoDream/` | 4 | 自动梦境/合并 |
| `contextCollapse/` | 3 | 上下文折叠管理 |
| `extractMemories/` | 2 | 记忆提取 |
| `langfuse/` | 5+1 | Langfuse 可观测性 |
| `localVault/` | 2+1 | 本地凭据保管库 |
| `MagicDocs/` | 2+1 | 魔术文档 |
| `oauth/` | 6 | OAuth 流程 |
| `plugins/` | 3 | 插件系统 |
| `policyLimits/` | 2 | 策略速率限制 |
| `PromptSuggestion/` | 2 | 提示建议 |
| `providerRegistry/` | 4+1 | provider 注册 |
| `providerUsage/` | 3+3 | provider 使用跟踪 |
| `remoteManagedSettings/` | 5 | 远程管理设置 |
| `SessionMemory/` | 3 | 会话内存 |
| `sessionTranscript/` | 1 | 会话记录 |
| `settingsSync/` | 2 | 设置同步 |
| `skillLearning/` | 22 | 技能学习系统 |
| `skillSearch/` | 9 | 技能搜索 |
| `teamMemorySync/` | 5 | 团队内存同步 |
| `tips/` | 4 | 提示系统 |
| `toolUseSummary/` | 1 | 工具使用摘要 |

### Mini-v9 独有的 Service 子目录

| 目录 | 文件数 | 说明 | 差异分析 |
|------|--------|------|----------|
| `config/` | 1 | configManager.ts | Main 的配置分散在多个文件中 (settings, config.ts, claudemd.ts 等) |
| `cron/` | 1 | scheduler.ts | Main 的定时功能分散在 cron 工具中 |
| `memory/` | 7+3 | 独立内存系统 | Main 有多套内存系统 (SessionMemory, extractMemories, agentMemory)、互不统一；mini-v9 集中到一个统一目录 |
| `permission/` | 4 | 权限系统 | Main 的权限逻辑在 hooks/toolPermission/ + utils/permissions.ts + components/permissions/ 中，分散在各层 |
| `session/` | 1+1 | 会话存储 | Main 的会话管理在 bridge/ + remote/ + assistant/ 等 |
| `skill/` | 3 | 技能加载 | Main 的 skills/ 是组件，skill skillLearning/ + skillSearch/ 极其复杂 |
| `ui/` | 9 | 纯终端 UI | Main 用 Ink (React) + packages/@ant/ink/ 框架，mini-v9 自己手写终端渲染 |

---

## 8. Agent/Team/Plan 系统对比

### Agent 系统

| 维度 | Main | Mini-v9 |
|------|------|---------|
| 源码位置 | `packages/builtin-tools/` + `src/utils/` + `src/services/acp/` | `src/agents/` (12 文件) |
| Agent 定义加载 | 磁盘 .md 文件 + 内置 + 插件 (~700行) | 内存注册表 + 内置 (323行) |
| Agent 上下文 | AsyncLocalStorage (agentContext.ts) | 简单 AgentRunContext |
| Forking | `forkedAgent.ts` (~550行), 全功能 | `forkSubagent.ts` (简化) |
| 后台执行 | 可恢复 + 即发即弃 | 仅同步 + 即发即弃 |
| 邮箱系统 | ~1100 行, 完整协议 | mailbox + poller (简化) |

### Team 系统

| 维度 | Main | Mini-v9 |
|------|------|---------|
| 架构 | `src/utils/swarm/` 多后端 (inProcess, pane, UDS) | 基于文件: teamManager + mailbox (简化) |
| InProcessBackend | ~1200行 | 无 |
| 队友类型 | InProcessTeammateTask, LocalAgentTask, RemoteAgentTask, LocalWorkflowTask, DreamTask, MonitorMcpTask | 仅 in-process teammate |
| Plan mode 集成 | planModeRequired 扩散所有模块 | 简单布尔值 |

### Plan 系统

| 维度 | Main | Mini-v9 |
|------|------|---------|
| 状态管理 | 分散在 utils/planModeV2.ts + utils/messages.ts + Ink 组件 | 集中: planMode.ts + planModeV2.ts + planStore.ts |
| 持久化 | 无（内存状态） | 磁盘文件 `~/.claude-code-mini/plans/{slug}.md` |
| 工作流 | 无 | **全新 WorkflowTool** + workflowStore.ts |

---

## 9. UI/渲染对比

| 方面 | Main | Mini-v9 |
|------|------|---------|
| 框架 | Ink (React 19 + react-reconciler) | 纯终端 (无框架) |
| 组件数 | 400+ | 9 个文件 |
| 消息渲染 | 30+ 消息组件类型 | 纯文本输出 |
| 权限对话框 | 20+ 权限 UI 组件 | `ui/dialogs/` 2 文件 |
| 主题系统 | ThemeProvider + colors | ❌ |
| 键盘绑定 | 完整系统 (定义/解析/加载/校验) | ❌ |
| React Context | 10+ providers | ❌ |
| Spinner | 15+ 文件 (动画、闪烁、队友) | `ui/spinner.ts` |
| 状态栏 | StatusLine.tsx + builtin + 40+ hooks | `ui/statusBar.ts` |
| 渲染器 | `src/ink.ts` (Ink 包装器) | `ui/renderer.ts` |
| 输入处理 | PromptInput 组件 (15+ 文件) | `ui/input.ts` |

**Mini-v9 UI 设计**: 走"CLI 工具"路线而非"终端应用"路线。放弃所有 React/Ink 代码，改用简单的 `spinner`/`input`/`statusBar`/`renderer`/`session`/`format` 模块，直接操作 stdout/stderr。

---

## 10. Mini-v9 独有的功能

这些是 mini-v9 **全新实现**、main 中没有的功能：

### 10.1 WorkflowTool + workflowStore
- **文件**: `src/tools/builtin/WorkflowTool/` (WorkflowTool.ts + types.ts) + `src/services/workflowStore.ts`
- **说明**: 多阶段工作流，带步骤跟踪、状态、进度报告。持久化到 `~/.claude-code-mini/workflows/{id}.json`
- **Main 状态**: 无此功能

### 10.2 独立 planStore
- **文件**: `src/services/planStore.ts`
- **说明**: 计划持久化为 Markdown + YAML frontmatter 文件
- **Main 状态**: 计划仅为内存状态

### 10.3 独立 planMode + planModeV2 服务
- **文件**: planMode.ts (346行) + planModeV2.ts (398行)
- **说明**: 集中式计划模式状态管理，6 个阶段常量，明确进度跟踪
- **Main 状态**: 分散到多个 utils 文件和 Ink 组件

### 10.4 memoryStore + memoryStoresClient
- **文件**: `src/services/memory/memoryStore.ts`, `memoryStoresClient.ts`
- **说明**: KV 风格记忆存储 + 客户端抽象
- **Main 状态**: 无独立内存存储层

### 10.5 memoryAge
- **文件**: `src/services/memory/memoryAge.ts`
- **说明**: 基于时间的记忆老化/过期
- **Main 状态**: 无显式老化模型

### 10.6 findRelevantMemories
- **文件**: `src/services/memory/findRelevantMemories.ts`
- **说明**: 词袋模型相关性排名，含停用词过滤
- **Main 状态**: 无独立相关性引擎

### 10.7 teamMemorySync
- **文件**: `src/services/memory/teamMemorySync.ts`
- **说明**: 团队记忆文件到服务器的内容哈希增量同步
- **Main 状态**: 无团队记忆同步（主要通过实时邮箱系统）

### 10.8 集中权限系统
- **文件**: `src/services/permission/` (4 文件)
- **说明**: permissionManager + permissionRuleParser + permissionsLoader
- **Main 状态**: 权限逻辑分散在 hooks/toolPermission/, components/permissions/, utils/permissions.ts

### 10.9 简化 API provider 层
- **文件**: `src/services/api/gemini/streamAdapter.ts`, `modelMap.ts`; `api/openai/streamAdapter.ts`, `modelMap.ts`
- **说明**: 将第三方 API 格式转为 Anthropic 格式，更整洁的分离
- **Main 状态**: 转换逻辑混合在 client 中

---

## 11. Main 有而 Mini-v9 没有的功能

### 11.1 基础设施类

| 功能 | 位置 | 说明 |
|------|------|------|
| Remote Control / Bridge 模式 | `src/bridge/` (40文件) | JWT 认证、会话管理、消息传输、权限回调 |
| Daemon 模式 | `src/daemon/` + feature flag | 长驻 supervisor + worker 管理 |
| ACP 协议 | `src/services/acp/` | Agent Client Protocol 完整实现 |
| SSH 会话 | `src/ssh/` | SSH 远程会话 |
| Voice 模式 | `src/voice/` | Push-to-Talk 语音输入 |
| Vim 模式 | `src/vim/` | Vim 键绑定 |
| 键盘绑定系统 | `src/keybindings/` | 完整定义/解析/加载/校验 |
| 上游代理 | `src/upstreamproxy/` | HTTP 代理 |
| 环境运行器 | `src/environment-runner/` | BYOC 环境 |
| 自托管运行器 | `src/self-hosted-runner/` | BYOC runner |
| 模板作业 | `src/jobs/` | 作业分类器和模板 |
| 设置迁移 | `src/migrations/` | 9 个迁移文件 |
| Magic Docs | `src/services/MagicDocs/` | 自动文档更新 |
| 插件系统 | `src/commands/plugin/` + `src/services/plugins/` + `src/plugins/` | 安装/卸载/浏览 Marketplace |
| OAuth | `src/services/oauth/` | 完整 OAuth 流程 |
| 本地保管库 | `src/services/localVault/` | 凭据安全存储 |
| 远程管理设置 | `src/services/remoteManagedSettings/` | 组织策略 |

### 11.2 遥测与分析类

| 功能 | 位置 | 说明 |
|------|------|------|
| Analytics | `src/services/analytics/` | Datadog, FirstParty, GrowthBook |
| Langfuse | `src/services/langfuse/` | OpenTelemetry tracing |
| Sentry | `src/services/analytics/sentry.ts` | 错误跟踪 |

### 11.3 Provider 类

| 功能 | 位置 | 说明 |
|------|------|------|
| AWS Bedrock | `src/services/api/bedrockClient.ts` | AWS Bedrock API |
| Grok (xAI) | `src/services/api/grok/` | xAI Grok API |
| Provider 注册表 | `src/services/providerRegistry/` | Provider 兼容性矩阵 |
| Provider 使用跟踪 | `src/services/providerUsage/` | Token 使用 |

### 11.4 监控与限制类

| 功能 | 位置 | 说明 |
|------|------|------|
| Rate limit 管理 | `src/services/rateLimitMessages.ts` | CLI 速率限制 |
| 策略限制 | `src/services/policyLimits/` | 组织策略限制 |
| Token 预算 | `src/query/tokenBudget.ts` | Token 使用跟踪 |
| 缓存断检测 | `src/services/api/promptCacheBreakDetection.ts` | Prompt 缓存健康 |

### 11.5 UI/UX 类

| 功能 | 位置 | 说明 |
|------|------|------|
| 全部 Ink UI 组件 | `src/components/` | ~400 组件 |
| REPL 屏幕 | `src/screens/REPL.tsx` | 交互式终端 UI |
| Doctor 屏幕 | `src/screens/Doctor.tsx` | 诊断界面 |
| Buddy 系统 | `src/buddy/` | 动画同伴 |
| Assistant | `src/assistant/` | 会话管理 |
| 主动通知 | `src/proactive/` | 主动体验 |
| 设置页面 | `src/components/Settings/` | 设置 UI |
| Agent 可视化 | `src/components/agents/` | Agent 管理 UI |

---

## 12. 总结与建议

### Mini-v9 的架构优势

1. **启动极快**: 无 React/Ink 渲染、无动态 import、无 feature flag 判断
2. **依赖极简**: 仅 5 个包 vs 140 个，安装快、构建快、无版本冲突
3. **代码清晰**: 集中式 service 层 (permission/memory/plan/session)，main 中这些逻辑分散在多个位置
4. **独特创新**: WorkflowTool + WorkflowStore 是 main 没有的全新概念
5. **纯终端 UI**: 避开了 Ink/React 的复杂性和性能开销
6. **统一内存系统**: 将 main 中 3+ 套内存方案统一到一个目录

### Main 保留的优势

1. **功能完备**: Bridge/Daemon/ACP/SSH/Voice/Vim/Plugins 等
2. **可视化 UI**: Ink 渲染的消息、权限对话框、进度条等
3. **多 Provider**: Bedrock/Vertex/Foundry/Grok 等
4. **遥测诊断**: Langfuse/Sentry/GrowthBook
5. **成熟度**: 经过大量测试和实战验证

### 建议关注的方向

如果要从 main 向 mini-v9 迁移功能，建议按此优先级：

1. **P0 必做**: 确保核心 query/compact/permission/memory/tool 系统与 main 保持 API 兼容
2. **P1 实用**: 移植 Remote Bridge (`src/bridge/`) 和 Plugin 系统 (`src/services/plugins/`)
3. **P2 增强**: 移植 Vim 模式、Voice 模式、SSH
4. **P3 增值**: 移植 Provider 注册表 + Grok/Bedrock/Vertex 兼容层
5. **可不移植**: Ink UI 组件、Analytics/Sentry/Langfuse、Daemon 模式、Keyboard bindings