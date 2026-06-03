# Mini-v9 vs 完整版 差距分析报告

> 生成日期: 2026-06-03
> 对比对象: `src/` (完整版) vs `mini-v9/src/` (mini-v9)

---

## 目录

1. [总体概览](#1-总体概览)
2. [入口与 CLI 架构](#2-入口与-cli-架构)
3. [Tool 系统对比](#3-tool-系统对比)
4. [命令系统对比](#4-命令系统对比)
5. [Service 层对比](#5-service-层对比)
6. [Agent 系统对比](#6-agent-系统对比)
7. [UI 层对比](#7-ui-层对比)
8. [Workspace 包缺失分析](#8-workspace-包缺失分析)
9. [完整版有而 mini-v9 没有的完整模块](#9-完整版有而-mini-v9-没有的完整模块)
10. [Mini-v9 独有的功能](#10-mini-v9-独有的功能)
11. [依赖与构建差异](#11-依赖与构建差异)
12. [总结](#12-总结)

---

## 1. 总体概览

| 维度 | 完整版 | Mini-v9 | 差距 |
|------|--------|---------|------|
| 源码文件数 | \~2705 | \~311 | **-2394 (88.5%)** |
| src/ 顶层目录数 | 36 | 16 | -20 |
| 工具数量 | 62 | 47 | -15 |
| 命令模块 | 105+ | 27 | -78 |
| Workspace 包 | 12 | 0 | **-12** |
| 测试文件 | \~450+ | 45 | -90%+ |
| 依赖包 | 140+ | 5 | **-135 (96.4%)** |

**核心理念差异**:
- **完整版**: 全功能反编译 CLI，React/Ink UI，多 Agent、Bridge、Daemon、15 workspace 包
- **Mini-v9**: 核心功能重构版，去掉 Ink UI / 重依赖组件，保留 Agent 循环 + 工具 + 命令骨架

---

## 2. 入口与 CLI 架构

| 方面 | 完整版 (`cli.tsx`) | Mini-v9 (`cli.ts`) |
|------|--------------------|--------------------|
| 扩展名 | `.tsx` (含 JSX) | `.ts` |
| 导入方式 | 动态 `await import()` + 静态 | 全部静态 import |
| Fast paths | 10+ (version, chrome-mcp, daemon, remote-control, bridge 等) | 无 |
| 主 CLI 框架 | Commander.js (`main.tsx`, ~6981 行) | 自定义参数解析 (`cli/args.ts`) |

**完整版额外 Fast Path** (mini-v9 全部没有):
- `--dump-system-prompt`, `--chrome-native-host`
- `--computer-use-mcp`
- `--daemon-worker=<kind>`
- `remote-control` / `remote` / `sync` / `bridge`
- `daemon` [subcommand]
- `ps` / `logs` / `attach` / `kill` / `--bg`
- `new` / `list` / `reply` (template jobs)
- `environment-runner` / `self-hosted-runner`
- `--tmux` + `--worktree`
- `--bare` mode

---

## 3. Tool 系统对比

### 工具总数

| 版本 | 工具数 |
|------|--------|
| 完整版 (`packages/builtin-tools/src/tools/`) | **62** |
| Mini-v9 (`src/tools/builtin/`) | **47** |
| **Mini-v9 缺少** | **15 个** |

### Mini-v9 缺少的工具 (15个)

| 工具 | 类别 | 说明 |
|------|------|------|
| DiscoverSkillsTool | Skill | 技能发现 |
| EnterWorktreeTool | Git | Git worktree 进入 |
| ExitWorktreeTool | Git | Git worktree 退出 |
| ListMcpResourcesTool | MCP | 列出 MCP 资源 |
| ListPeersTool | 网络 | 列出对等节点 |
| McpAuthTool | MCP | MCP OAuth 认证 |
| OverflowTestTool | 测试 | 溢出测试 |
| PushNotificationTool | 通知 | 桌面推送通知 |
| ReadMcpResourceTool | MCP | 读取 MCP 资源 |
| RemoteTriggerTool | 远程 | 远程触发 |
| REPLTool | REPL | REPL 交互 |
| ReviewArtifactTool | Review | 评审产物 |
| ScheduleCronTool | Cron | 定时任务 |
| SnipTool | Compact | 截断工具 |
| SubscribePRTool | GitHub | 订阅 PR |
| SuggestBackgroundPRTool | GitHub | 建议后台 PR |
| TerminalCaptureTool | 终端 | 终端捕获 |
| TungstenTool | Tungsten | Tungsten 集成 |
| VaultHttpFetchTool | 安全 | Vault HTTP 获取 |

### Mini-v9 独有的工具 (7个，完整版没有)

| 工具 | 说明 |
|------|------|
| ApplyPatchTool | 应用代码补丁 |
| CronCreateTool | 创建定时任务 |
| CronDeleteTool | 删除定时任务 |
| CronListTool | 列出定时任务 |
| GitDiffTool | Git diff 查看 |
| GitLogTool | Git log 查看 |
| GitStatusTool | Git status 查看 |

---

## 4. 命令系统对比

| 维度 | 完整版 | Mini-v9 |
|------|--------|---------|
| 命令模块数 | **105+** (src/commands/ 子目录) | **27** (单个文件) |
| 组织方式 | 按功能分目录 (每个命令一个目录) | 按功能分文件 (单文件) |
| 共享代码 | `_shared/` 目录 (含测试) | `_shared.ts` 单文件 |

### Mini-v9 已有的命令 (27个)

`addDir`, `agent`, `agentCommands`, `clear`, `compact`, `config`, `doctor`, `exit`, `export`, `force-snip`, `fork`, `help`, `history`, `index`, `mcp`, `memory`, `memoryCommands`, `model`, `permissions`, `plugin`, `pluginCommands`, `registry`, `session`, `skill`, `skillCommands`, `status`, `version`

### 完整版有而 mini-v9 没有的命令 (78+个)

按类别分组:

| 类别 | 缺失命令 |
|------|----------|
| **Agent** | `agents`, `agents-platform` |
| **Git** | `branch`, `diff`, `rename` |
| **桥接/远程** | `bridge`, `remoteControlServer`, `remote-env`, `remote-setup`, `detach`, `attach`, `teleport` |
| **认证** | `login`, `logout`, `oauth-refresh` |
| **设置** | `color`, `config` (增强版), `effort`, `fast`, `lang`, `theme`, `output-style`, `poor` |
| **诊断** | `doctor` (增强版), `cost`, `debug-tool-call`, `heapdump`, `stats`, `bughunter`, `perf-issue`, `recap` |
| **文件** | `files`, `vault`, `local-vault`, `local-memory` |
| **对话** | `clear` (增强版), `copy`, `export` (增强版), `fork` (增强版), `history` (增强版), `rewind`, `send`, `share`, `summary`, `tag`, `thinkback`, `thinkback-play` |
| **任务/作业** | `job`, `tasks`, `schedule` |
| **Review** | `review`, `autofix-pr`, `pr_comments` |
| **Plan** | `plan` |
| **Plugin/Skill** | `plugin` (增强版), `skills`, `skill-learning`, `skill-search`, `skill-store` |
| **MCP** | `mcp` (增强版) |
| **环境** | `env`, `terminalSetup`, `sandbox-toggle` |
| **其他** | `assistant`, `buddy`, `btw`, `chrome`, `claim-main`, `context`, `ctx_viz`, `daemon`, `desktop`, `extra-usage`, `feedback`, `good-claude`, `help` (增强版), `hooks`, `ide`, `install-github-app`, `install-slack-app`, `keybindings`, `mobile`, `mock-limits`, `onboarding`, `passes`, `peers`, `pipes`, `pipe-status`, `privacy-settings`, `rate-limit-options`, `release-notes`, `reload-plugins`, `reset-limits`, `resume`, `session` (增强版), `stickers`, `tui`, `upgrade`, `usage`, `vim`, `voice`, `workflows` |

---

## 5. Service 层对比

### 完整版有而 mini-v9 没有的 Service

| 模块 | 说明 | 重要性 |
|------|------|--------|
| `acp/` | Agent Client Protocol (agent+bridge+permissions, 10+ 文件) | 高 |
| `AgentSummary/` | Agent 对话摘要 | 中 |
| `analytics/` | 遥测 (Datadog/FirstParty/GrowthBook/Sentry) | 低 |
| `auth/` | 认证 (hostGuard, saveWorkspaceKey) | 高 |
| `autoDream/` | 自动梦境合并 | 低 |
| `awaySummary.ts` | 离开摘要 | 中 |
| `contextCollapse/` | 上下文折叠管理 | 高 |
| `doubaoSTT.ts` | 豆包语音转文字 | 低 |
| `extractMemories/` | 记忆提取 | 中 |
| `internalLogging.ts` | 内部日志 | 中 |
| `langfuse/` | Langfuse 可观测性 | 低 |
| `localVault/` | 本地凭据保管库 | 中 |
| `MagicDocs/` | 魔术文档自动更新 | 中 |
| `mcpServerApproval.tsx` | MCP 服务器审批 UI | 低 |
| `notifier.ts` | 通知器 | 低 |
| `oauth/` | OAuth 流程 | 高 |
| `plugins/` | 插件系统 | 高 |
| `policyLimits/` | 策略速率限制 | 中 |
| `preventSleep.ts` | 阻止休眠 | 低 |
| `PromptSuggestion/` | 提示建议 | 中 |
| `providerRegistry/` | provider 注册表 (兼容性矩阵) | 中 |
| `providerUsage/` | provider 使用跟踪 | 中 |
| `rateLimitMessages.ts` | 速率限制消息 | 低 |
| `remoteManagedSettings/` | 远程管理设置 | 低 |
| `settingsSync/` | 设置同步 | 低 |
| `skillLearning/` | 技能学习系统 (22 文件) | 高 |
| `skillSearch/` | 技能搜索 (9 文件) | 高 |
| `teamMemorySync/` | 团队内存同步 | 中 |
| `tips/` | 提示系统 | 低 |
| `toolUseSummary/` | 工具使用摘要 | 低 |
| `vcr.ts` | VCR 录制回放 | 低 |
| `voice.ts` 等 | 语音系统 | 中 |

### Mini-v9 独有的 Service

| 模块 | 说明 | 与完整版差异 |
|------|------|-------------|
| `config/configManager.ts` | 集中配置管理 | 完整版配置分散在 settings/ 和多个文件中 |
| `cron/scheduler.ts` | 定时调度器 | 完整版 cron 功能在工具中 |
| `memory/` 全套 | 独立内存系统 | 完整版有多套内存系统分散在各处 |
| `messages/apiProjection.ts` | API 消息投影 | 完整版也有但实现不同 |
| `permission/` 4 文件 | 集中权限管理 | 完整版权限逻辑分散在 hooks+components+utils |
| `session/sessionStore.ts` | 会话存储 | 完整版会话管理分散在 bridge/remote/assistant |
| `skill/skillStore.ts` | Skill 存储 | 完整版 skill 系统在 utils/skills |

---

## 6. Agent 系统对比

| 维度 | 完整版 | Mini-v9 |
|------|--------|---------|
| 源码位置 | `packages/builtin-tools/` + `src/utils/agentContext.ts` + `src/services/acp/` | `src/agents/` (12 文件) |
| 内置 Agent 数 | 5+ (Explore, Plan, General, CodeReview, Coordinator) | 6 (多加一个 Worker) |
| Agent 类型 | 加载器复杂 (.md 文件 + 内置 + 插件) | 内存注册表 + 内置 |
| Fork 机制 | `forkedAgent.ts` (~550行, 全功能) | `forkSubagent.ts` (简化版) |
| 邮箱通信 | \~1100 行, 完整协议 | `mailboxPoller.ts` + `teammateMailbox.ts` (简化) |
| Summarization | 完整版内置 | `agentSummarization.ts` (独有) |
| 后台执行 | 可恢复 + 即发即弃 | 仅同步 + 即发即弃 |

**完整版有而 mini-v9 没有的 Agent 相关能力**:
- 完整的 Swarm 系统 (`utils/swarm/`) 含多后端 (inProcess, pane, UDS)
- 6 种 Task 类型 (InProcessTeammate, LocalAgent, RemoteAgent, LocalWorkflow, Dream, MonitorMcp)
- ACP Agent 协议 (acp-link 包 + `services/acp/`)

---

## 7. UI 层对比

| 方面 | 完整版 | Mini-v9 |
|------|--------|---------|
| 框架 | Ink (React 19 + react-reconciler) | **无框架，纯终端操作** |
| 组件数 | 400+ (src/components/) | 9 个文件 (src/ui/) |
| 消息渲染 | 30+ 消息类型组件 | 纯文本输出 |
| 权限对话框 | 20+ 权限 UI 组件 | `dialogs/permissionDialog.ts` |
| 主题系统 | ThemeProvider + 全套颜色 | ❌ |
| 键盘绑定 | src/keybindings/ 完整系统 | ❌ |
| React Context | 10+ providers | ❌ |
| Spinner/hooks | 15+ 文件 | `spinner.ts` 单文件 |
| REPL 全屏 | `screens/REPL.tsx` + `screens/Doctor.tsx` | ❌ |

**Mini-v9 UI 定位**: 走"CLI 工具"路线，简单 spinner/statusBar/renderer，直接操作 stdout

---

## 8. Workspace 包缺失分析

完整版有 12 个 workspace 包，mini-v9 **全部没有**:

| 包名 | 作用 | 影响 |
|------|------|------|
| `@ant/ink` | Forked Ink 框架 (components, hooks, keybindings, theme) | **无 Ink UI** |
| `@ant/computer-use-mcp` | Computer Use MCP server (截图/键鼠/剪贴板) | 无 Computer Use |
| `@ant/computer-use-input` | 键鼠模拟 (3 平台 backend) | 无键鼠控制 |
| `@ant/computer-use-swift` | 截图 + 应用管理 | 无截图能力 |
| `@ant/claude-for-chrome-mcp` | Chrome 浏览器控制 | 无浏览器控制 |
| `@ant/model-provider` | Model provider 抽象层 | 无 Bedrock/Vertex |
| `builtin-tools` | 60 个工具实现 (532 文件) | 缺失 15 个工具 |
| `agent-tools` | Agent 工具集 | agent 能力弱化 |
| `acp-link` | ACP 代理服务器 (WebSocket 桥接) | 无 ACP 协议 |
| `mcp-client` | MCP 客户端库 | MCP 能力弱 |
| `remote-control-server` | 自托管 RCS (Docker + Web UI) | 无远程控制 |
| `audio-capture-napi` | 原生音频捕获 | 无音频 |
| `color-diff-napi` | 颜色差异计算 | 无颜色分析 |
| `image-processor-napi` | 图像处理 | 无图像处理 |
| `modifiers-napi` | 键盘修饰键检测 | 无修饰键 |
| `url-handler-napi` | URL scheme 处理 | URL 处理弱 |
| `weixin` | 微信集成 | ✅ 不需要 |

---

## 9. 完整版有而 mini-v9 没有的完整模块

| 模块 | 文件数 | 说明 | 优先级 |
|------|--------|------|--------|
| `src/components/` | \~400+ | Ink UI 组件 (消息、权限、Spinner、Agent 管理等) | P3 |
| `src/screens/` | 3+ | 全屏 REPL/Doctor | P3 |
| `src/hooks/` | \~100+ | React hooks | P3 |
| `src/keybindings/` | \~20 | 键盘快键键 | P2 |
| `src/bridge/` | \~40 | Remote Control / Bridge | **P1** |
| `src/daemon/` | \~10 | Daemon 长驻进程 | P2 |
| `src/buddy/` | \~10 | 同伴动画 | P3 |
| `src/assistant/` | \~10 | Assistants 管理 | P2 |
| `src/coordinator/` | \~5 | 协调器 | P2 |
| `src/proactive/` | \~5 | 主动操作 | P3 |
| `src/remote/` | \~5 | 远程会话 | P2 |
| `src/server/` | \~10+ | 本地服务器 | P3 |
| `src/jobs/` | \~10 | 模板作业 | P2 |
| `src/ssh/` | \~10 | SSH 会话 | P2 |
| `src/vim/` | \~10 | Vim 模式 | P2 |
| `src/voice/` | \~10+ | 语音模式 | P2 |
| `src/upstreamproxy/` | \~5 | HTTP 代理 | P3 |
| `src/moreright/` | 1 | MoreRight | P3 |
| `src/outputStyles/` | 1 | 输出样式 | P3 |
| `src/migrations/` | 9 | 设置迁移 | P3 |
| `src/skills/` | \~20 | 技能文件 | **P1** |
| `src/schemas/` | \~5 | Zod 模式 | P3 |
| `src/tasks/` | \~20 | 任务类型实现 | P2 |
| `src/state/` | \~10 | AppState (Zustand) | P3 |
| `src/environment-runner/` | \~10 | BYOC 环境 | P2 |
| `src/self-hosted-runner/` | \~10 | BYOC runner | P2 |
| `src/memdir/` | \~5 | 内存目录 | P2 |

---

## 10. Mini-v9 独有的功能

这些是 mini-v9 **有而完整版没有**的功能:

### 10.1 WorkflowTool + workflowStore
- **文件**: `tools/builtin/WorkflowTool/` (WorkflowTool.ts + types.ts) + `services/workflowStore.ts`
- **说明**: 多阶段工作流引擎，步骤跟踪、状态管理、持久化到磁盘
- **完整版**: 无此功能 (WorkflowTool 在完整版 2026年3月还未开发)

### 10.2 PlanStore
- **文件**: `services/planStore.ts`
- **说明**: 计划持久化为 Markdown + YAML frontmatter 文件
- **完整版**: 计划仅为内存状态

### 10.3 PlanModeV2
- **文件**: `planModeV2.ts` (398行)
- **说明**: 二代计划模式，6 阶段常量，进度跟踪
- **完整版**: 计划状态分散在多个 utils 文件

### 10.4 集中内存系统
- **文件**: `services/memory/` 全套 (memoryStore, memoryStoresClient, sessionMemory, teamMemorySync, memoryAge, findRelevantMemories, memdir)
- **说明**: KV 风格记忆 + 相关性排名 + 时间老化 + 团队同步
- **完整版**: 内存分散在 SessionMemory, extractMemories, agentMemory 等多套系统

### 10.5 集中权限系统
- **文件**: `services/permission/` (4 文件)
- **说明**: permissionManager + permissionRuleParser + permissionsLoader
- **完整版**: 权限逻辑分散在 hooks + components + utils

### 10.6 Git 三工具
- **文件**: GitDiffTool, GitLogTool, GitStatusTool
- **说明**: Git 专用工具族
- **完整版**: 仅通过 BashTool + grep 实现

### 10.7 Cron 工具族
- **文件**: CronCreateTool, CronDeleteTool, CronListTool
- **说明**: 定时任务管理
- **完整版**: 通过 ScheduleCronTool 实现 (API 不同)

### 10.8 ApplyPatchTool
- **文件**: tools/builtin/ApplyPatchTool/
- **说明**: 智能代码补丁
- **完整版**: 无此工具

### 10.9 AgentSummarization
- **文件**: `agents/agentSummarization.ts`
- **说明**: Agent 执行摘要生成
- **完整版**: 内置在 AgentSummary 服务中

### 10.10 阶段式折叠 (stagedCompact)
- **文件**: `services/compact/stagedCompact.ts`
- **说明**: 非破坏性逐步上下文压缩
- **完整版**: 使用 contextCollapse/ 服务 (实现不同)

---

## 11. 依赖与构建差异

### 依赖对比

```
完整版:  @anthropic-ai/sdk, chalk, cli-highlight, highlight.js, ws,
         @aws-sdk/*, @anthropic-ai/mcpb, @agentclientprotocol/sdk,
         + 127 devDependencies (React 19, Ink, AWS SDK, OpenTelemetry, 
           Sentry, Langfuse, Zod, Vite, Biome, Husky, +100 more)
         + 12 workspace packages (15 个 workspace 依赖)
         + 1 optional dependency (doubaoime-asr)

Mini-v9: @anthropic-ai/sdk, chalk, cli-highlight
         + 2 devDependencies (@types/bun, typescript)
```

### Mini-v9 移除的关键依赖

| 依赖 | 影响 |
|------|------|
| React 19 + react-reconciler + Ink | **无 Ink UI** |
| AWS SDK (`@aws-sdk/*`) | 无 Bedrock provider |
| OpenTelemetry + Sentry + Langfuse | 无遥测/APM |
| Biome + Husky + lint-staged | 无 lint/format |
| Vite + Rollup | 改为纯 Bun build |
| Sharp + audio-capture-napi + image-processor-napi | 无原生模块 |
| Zod | 无 schema 验证库 |

### tsconfig 差异

| 选项 | 完整版 | Mini-v9 |
|------|--------|---------|
| target | ESNext | ES2022 |
| module | ESNext | ES2022 |
| paths | 5+ workspace 别名 + src/* | 仅 src/* |
| include | src/**/*.{ts,tsx} + packages/**/*.{ts,tsx} | 仅 src/**/*.ts |
| 基文件 | 继承 tsconfig.base.json | 独立配置 |
| 无 TSX | ❌ (有 tsx) | ✅ (纯 ts) |

### 构建差异

| 方面 | 完整版 | Mini-v9 |
|------|--------|---------|
| 构建工具 | Bun build + Vite (双构建系统) | 仅 Bun build |
| 构建复杂度 | `build.ts` 含代码分割 + Feature flags + Bun→Node 兼容 | 单行命令 |
| Feature flags | 65+ 条件编译 flag | 无 |
| 输出产物 | `dist/cli.js` + chunk 文件 | 单一输出 |

---

## 12. 总结

### Mini-v9 的架构优势

1. **极简依赖**: 仅 5 个包 vs 140+，安装构建极快
2. **集中式设计**: permission/memory/plan 统一管理，完整版分散在多处
3. **独有创新**: WorkflowTool, PlanStore, PlanModeV2, Git/CRON 工具族
4. **无 React/Ink**: 避开了 Ink 的复杂性和性能开销
5. **纯终端 UI**: 9 文件 vs 400+ 组件，定位清晰

### 完整版保留的优势

1. **功能完备**: Bridge/Daemon/ACP/SSH/Voice/Vim/Computer Use/Plugins
2. **可视化 UI**: Ink 渲染 + 权限对话框 + 消息展示
3. **多 Provider**: Bedrock/Vertex/Grok/Foundry/OpenAI/Gemini
4. **遥测诊断**: Langfuse/Sentry/GrowthBook
5. **Swarm 系统**: 多后端 Agent 协作

### 缺失重要性的分层

| 层级 | 功能 | 理由 |
|------|------|------|
| **P0 - 核心** | (已全部实现) | Agent 循环, 工具, API, Memory, Context |
| **P1 - 推荐** | Bridge/RC, OAuth, Plugin, Skills, Agent types | 工程化必备 |
| **P2 - 可选** | SSH, Vim, Voice, Daemon, Swarm, Computer Use | 场景增强 |
| **P3 - 不必要** | Ink UI, Analytics, Sentry, audits | mini-v9 定位不需要 |