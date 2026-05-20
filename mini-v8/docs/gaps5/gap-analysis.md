# mini-v8 与主项目差距分析

> 分析范围：主项目 `woyao-code_bcc` vs `mini-v8` 的 `src/` 目录。
> 数据截止日期：2026-05-20
  1. 概览规模 — 主项目 src 约 6000+ 文件 vs mini-v8 约 250 文件，24 倍差距
  2. 完整缺失的顶层模块 — 列举了 14 个完全缺失的目录（screens、components、hooks、bridge、daemon、ssh、vim、voice 等）
  3. 跨模块对比 — 详细对比了 services（30 个子模块逐个标注状态）、utils、commands、cli、state、tests 的差距
  4. Package 层差距 — 主项目 13 个 workspace 包（含 @ant/ink 2000+ 文件、mcp-client 1848 文件、remote-control-server 3290 文件），mini-v8 零包
  5. 工具集差距 — 主项目 60+ 工具 vs mini-v8 约 35 个，逐个对比
  6. 架构风格差异 — Ink React vs 纯文本、Zustand vs 无状态管理等 9 个维度
  7. 核心能力评分 — 10 项能力 1-5 星评分
  8. 总结 + 缩小差距的 P0-P3 优先级建议
---

## 一、概览：规模差距

| 维度 | 主项目 | mini-v8 | 差距 |
|------|--------|---------|------|
| src 顶层目录数 | 40 | 15 | 少 25 个 |
| src 代码文件总数（估算） | ~6000+ | ~250 | 约 24 倍 |
| package 数量 | 13 | 0 | 全部缺失 |
| 测试文件数 | ~112+ | 40 | 偏少但结构完整 |

mini-v8 的目标不是复刻主项目，而是提取核心骨架（Agent 系统 + 工具框架 + 查询循环），剪掉了大量业务功能。以下按模块分析具体缺失项。

---

## 二、完整缺失的顶层模块

以下目录在主项目中存在，mini-v8 完全缺失：

### 2.1 UI/交互层（核心差距）

| 目录 | 主项目文件数 | 说明 |
|------|-------------|------|
| `screens/` | 3 | 终端交互界面（REPL、Permission、Plan 等屏幕） |
| `components/` | 412 | Ink React 组件系统（MessageRow、PromptInput、permissions 等） |
| `hooks/` | 118 | Ink 钩子及自定义 hooks |
| `keybindings/` | 15 | 键盘快捷键绑定 |
| `outputStyles/` | 1 | 输出样式 |

**影响**：mini-v8 没有终端 UI，无法作为一个交互式 CLI 使用。只能通过编程方式（直接调用 query/QueryEngine）交互。

### 2.2 网络/远程

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `bridge/` | 40 | Remote Control / Bridge 模式（JWT 认证、消息传输、权限回调） |
| `remote/` | 4 | 远程会话管理 |
| `server/` | 11 | HTTP server |
| `ssh/` | 6 | SSH 远程连接 |
| `upstreamproxy/` | 2 | 上游代理 |
| `coordinator/` | 2 | 多 worker 协调 |

**影响**：mini-v8 没有任何网络/远程能力，只能本地单进程运行。

### 2.3 基础设施

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `daemon/` | 5 | 守护进程模式（长驻 supervisor） |
| `buddy/` | 9 | Buddy 协作者 |
| `jobs/` | 6 | 模板任务系统 |
| `tasks/` | 15 | 任务管理 |
| `memdir/` | 9 | 记忆目录（持久化存储） |
| `migrations/` | 10 | 数据迁移 |
| `vim/` | 5 | Vim 模式 |
| `voice/` | 1 | 语音模式 |
| `proactive/` | 3 | 主动工作流 |
| `schemas/` | 1 | 数据模式定义 |

### 2.4 技能/学习

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `skills/` | 23 | 技能系统（bundled skills、verify 等） |
| `assistant/` | 6 | 助手会话管理（session chooser、discovery、gate） |

### 2.5 插件

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `plugins/` | 3 | 插件系统入口（mini-v8 有 8 个文件，但类型不同） |

---

## 三、跨模块对比：共享目录的差距

### 3.1 `services/`（主 282 文件 vs mini-v8 55 文件）

| 子模块 | 主项目 | mini-v8 | 状态 |
|--------|--------|---------|------|
| `acp/` | 10 | 0 | **全缺** — ACP Agent 协议实现 |
| `AgentSummary/` | 6 | 0 | **全缺** — Agent 摘要生成 |
| `analytics/` | 9 | 0 | **全缺** — 数据分析（埋点、统计） |
| `api/` | 38 | 7 | **半缺** — 仅有 Anthropic + OpenAI + Gemini 核心客户端，缺 Grok/Foundry 等 provider |
| `auth/` | 4 | 0 | **全缺** — 认证管理 |
| `autoDream/` | 4 | 0 | **全缺** — 自动思考/规划 |
| `compact/` | 21 | 10 | **半缺** — 有核心压缩逻辑，缺 sessionMemory 集成、完整 prompt 模板 |
| `contextCollapse/` | 3 | 0 | **全缺** — 上下文折叠 |
| `extractMemories/` | 2 | 0 | **全缺** — 记忆提取 |
| `langfuse/` | 7 | 0 | **全缺** — Langfuse 遥测集成 |
| `localVault/` | 4 | 0 | **全缺** — 本地保险箱 |
| `lsp/` | 9 | 2 | **半缺** — 仅有基础 LSP 客户端 + 管理器，缺完整功能 |
| `MagicDocs/` | 3 | 0 | **全缺** — 魔法文档自动更新 |
| `mcp/` | 31 | 1 | **大部分缺** — 仅有基础 MCPTool，缺完整 MCP 客户端/服务器 |
| `oauth/` | 6 | 0 | **全缺** — OAuth 认证流程 |
| `plugins/` | 3 | 0 | **全缺** — 插件系统服务 |
| `policyLimits/` | 2 | 0 | **全缺** — 策略限制 |
| `PromptSuggestion/` | 2 | 0 | **全缺** — 提示建议 |
| `providerRegistry/` | 7 | 0 | **全缺** — Provider 注册表 |
| `providerUsage/` | 10 | 0 | **全缺** — Provider 用量统计 |
| `remoteManagedSettings/` | 5 | 0 | **全缺** — 远程托管设置 |
| `searchExtraTools/` | 5 | 4 | **较完整** — TF-IDF 工具索引 |
| `SessionMemory/` | 6 | 0 | **全缺** — 会话记忆系统 |
| `sessionTranscript/` | 1 | 0 | **全缺** — 会话转录 |
| `settingsSync/` | 2 | 0 | **全缺** — 设置同步 |
| `skillLearning/` | 37 | 0 | **全缺** — 技能学习（完整系统） |
| `skillSearch/` | 12 | 0 | **全缺** — 技能搜索 |
| `teamMemorySync/` | 5 | 0 | **全缺** — 团队记忆同步 |
| `tips/` | 4 | 0 | **全缺** — 使用提示 |
| `tools/` | 5 | 2 | **半缺** — 仅基础工具服务 |
| `toolUseSummary/` | 1 | 0 | **全缺** — 工具使用摘要 |

### 3.2 `utils/`（主 761 文件 vs mini-v8 31 文件）

mini-v8 仅有最基础的工具函数。缺失的主要模块：

| 子模块 | 文件数 | 说明 |
|--------|--------|------|
| `permissions/` | 31 | 权限系统（规则解析、模式管理、YOLO 分类器） |
| `plugins/` | 44 | 插件系统（发现、加载、安装、Marketplace） |
| `computerUse/` | 34 | 计算机使用（截图、键鼠控制、应用管理） |
| `bash/` | 23 | Bash 工具（执行、安全、超时、输出处理） |
| `settings/` | 21 | 设置管理（读/写/合并/验证） |
| `model/` | 21 | 模型管理（provider 选择、能力映射、上下文窗口） |
| `hooks/` | 18 | 钩子系统（preToolUse、postToolUse、stop） |
| `swarm/` | 28 | Swarm 多 Agent 协调 |
| `shell/` | 11 | Shell 环境管理 |
| `telemetry/` | 9 | 遥测（事件埋点、属性收集） |
| `secureStorage/` | 7 | 安全存储（密钥链、加密） |
| `claudeInChrome/` | 7 | Chrome 浏览器 MCP 集成 |
| `deepLink/` | 7 | 深度链接协议 |
| `suggestions/` | 6 | 命令建议 |
| `task/` | 6 | 任务存储 |
| `nativeInstaller/` | 5 | 原生安装器 |
| `processUserInput/` | 5 | 用户输入处理 |
| `teleport/` | 5 | Teleport 环境切换 |
| `git/` | 4 | Git 工具集成 |
| `mcp/` | 2 | MCP 工具函数 |
| `memory/` | 2 | 内存/记忆工具 |
| `messages/` | 2 | 消息工具函数 |
| `sandbox/` | 2 | 沙箱模式 |
| `background/` | 2 | 后台任务 |
| `ultraplan/` | 3 | 超人规划（结构化计划生成） |
| `vendor/` | 0+ | vendor 二进制（ripgrep 等，mini-v8 全缺） |

### 3.3 `commands/`（主 387 文件 vs mini-v8 29 文件）

mini-v8 只有 29 个文件（约 13 个命令），主项目有 387 个文件（约 100+ 个命令）。

mini-v8 已有的命令：`version`、`session`、`fork`、`status`、`export`、`config`、`history`、`agent`、`clear`、`doctor`、`exit`、`help`、`mcp`、`memory`、`model`、`permissions`、`plugin`、`skill`

主项目额外有约 90+ 个命令，包括：
- **开发者工具**：`plan`、`review`、`diff`、`fork`、`rewind`、`rename`
- **远程/协作**：`remote-setup`、`remote-env`、`peers`、`bridge`、`ssh`、`teleport`
- **账号/认证**：`login`、`logout`、`oauth-refresh`、`auth`
- **配置**：`config`、`theme`、`color`、`lang`、`output-style`
- **数据**：`export`、`history`、`usage`、`cost`、`stats`
- **技能/学习**：`skills`、`skill-search`、`skill-store`、`skill-learning`
- **任务**：`tasks`、`job`、`schedule`
- **维护**：`upgrade`、`doctor`、`heapdump`、`break-cache`

### 3.4 `cli/`（主 37 文件 vs mini-v8 1 文件）

mini-v8 只有 `args.ts`（参数解析），主项目有完整的 CLI 框架（参数解析、提示词、格式化、多平台支持）。

### 3.5 测试

| 维度 | 主项目 | mini-v8 |
|------|--------|---------|
| `src/__tests__/` | 7 文件 | 40 文件 |
| `src/**/__tests__/` | ~105 | 若干 |
| 特点 | 偏集成测试 | 偏单元测试，覆盖 agent 系统 |

### 3.6 `state/`（主 7 文件 vs mini-v8 0 文件）

主项目有完整的 Zustand 状态管理（AppState、Store、Selectors），mini-v8 完全没有。

---

## 四、package 层差距

主项目有 13 个 workspace 包，mini-v8 一个都没有：

| 包名 | 文件数 | 说明 |
|------|--------|------|
| `@ant/ink/` | ~2000+ | Forked Ink 框架（终端 React 渲染） |
| `builtin-tools/` | 784 | 60 个内置工具 |
| `agent-tools/` | 422 | Agent 工具集 |
| `mcp-client/` | 1848 | MCP 客户端库 |
| `acp-link/` | 836 | ACP 代理服务器 |
| `remote-control-server/` | 3290 | 自托管 RCS（含 Web UI） |
| `computer-use 系` | 多个 | 计算机使用（截图、键鼠、应用管理） |
| `native 系` | 数个 | 原生扩展（音频、图像、颜色差异等） |

**影响**：mini-v8 的依赖仅 `@anthropic-ai/sdk` + `typescript` + `@types/bun`，没有任何 Ink 或 MCP 依赖。

---

## 五、工具集差距

| 工具 | 主项目 | mini-v8 |
|------|--------|---------|
| AgentTool | ✅ | ✅ |
| BashTool | ✅ | ✅ |
| FileEditTool | ✅ | ✅ |
| FileReadTool | ✅ | ✅ |
| FileWriteTool | ✅ | ✅ |
| GlobTool | ✅ | ✅ |
| GrepTool | ✅ | ✅ |
| WebFetchTool | ✅ | ✅ |
| WebSearchTool | ✅ | ✅ |
| AskUserQuestionTool | ✅ | ✅ |
| TaskCreate/Get/List/Output/Stop/UpdateTool | ✅ | ✅ |
| SkillTool | ✅ | ✅ |
| MCPTool | ✅ | ✅ |
| LSPTool | ✅ | ✅ |
| Enter/ExitPlanModeTool | ✅ | ✅ |
| ExecuteTool | ✅ | ✅ |
| NotebookEditTool | ✅ | ✅ |
| SendMessageTool | ✅ | ✅ |
| WebBrowserTool | ✅ | ❌（mini-v8 有但主项目不在 builtin-tools） |
| CronTool 系列 | ✅ | ✅ |
| PowerShellTool | ✅ | ✅ |
| ConfigTool | ✅ | ✅ |
| VerifyPlanExecutionTool | ✅ | ✅ |
| SyntheticOutputTool | ✅ | ✅ |
| SearchExtraToolsTool | ✅ | ✅ |
| SleepTool | ✅ | ❌ |
| SendUserFileTool | ✅ | ✅ |
| BriefTool | ✅ | ✅ |
| TeamCreate/DeleteTool | ✅ | ✅ |
| TodoWriteTool | ✅ | ✅ |
| ApplyPatchTool | ❌ | ✅（mini-v8 独有） |
| **缺少的工具** | | |
| PushNotificationTool | ✅ | ❌ |
| MonitorTool | ✅ | ❌ |
| EnterWorktreeTool | ✅ | ❌ |
| ExitWorktreeTool | ✅ | ❌ |
| SnipTool | ✅ | ❌ |
| ScheduleCronTool | ✅ | ❌ |
| TerminalCaptureTool | ✅ | ❌ |
| SubscribePRTool | ✅ | ❌ |
| SuggestBackgroundPRTool | ✅ | ❌ |
| VaultHttpFetchTool | ✅ | ❌ |
| WorkflowTool | ✅ | ❌ |
| ListMcpResourcesTool | ✅ | ❌ |
| ReadMcpResourceTool | ✅ | ❌ |
| ListPeersTool | ✅ | ❌ |
| RemoteTriggerTool | ✅ | ❌ |
| CtxInspectTool | ✅ | ❌ |
| TungstenTool | ✅ | ❌ |
| OverflowTestTool | ✅ | ❌ |
| DiscoverSkillsTool | ✅ | ❌ |
| LocalMemoryRecallTool | ✅ | ❌ |
| ReviewArtifactTool | ✅ | ❌ |
| **共享工具（shared/）** | ✅ | ❌ |
| **测试工具（testing/）** | ✅ | ❌ |

---

## 六、架构风格差异

| 维度 | 主项目 | mini-v8 |
|------|--------|---------|
| **UI 框架** | Ink React（终端渲染） | 纯文本/无 UI |
| **状态管理** | Zustand Store + Context | 无（module-level singletons） |
| **权限系统** | YOLO 分类器 + 规则解析器 | 基础权限管理器 |
| **插件系统** | Marketplace + 安装/卸载 | 简单插件加载 |
| **构建工具** | Bun build + Vite | Bun build |
| **Monorepo** | 17 workspace 包 + workspaces | 单包 |
| **Feature Flag** | Bun bundle define 注入 | 无 |
| **测试框架** | bun:test | bun:test |
| **CI** | GitHub Actions | 无 |

---

## 七、核心能力评分对比

| 能力 | 主项目 | mini-v8 | 说明 |
|------|--------|---------|------|
| **Agent 系统** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | mini-v8 有完整的 Agent 实现（runner、registry、memory、team、mailbox） |
| **工具框架** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | mini-v8 有约 35 个核心工具，缺 ~20 个 |
| **查询循环** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 完整 query + QueryEngine 实现 |
| **压缩系统** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 有完整多层压缩，缺 sessionMemory 集成 |
| **MCP 集成** | ⭐⭐⭐⭐⭐ | ⭐⭐ | 仅有基础 MCPTool，缺 mcp-client 完整库 |
| **终端 UI** | ⭐⭐⭐⭐⭐ | ⭐ | 无 Ink 组件，无交互界面 |
| **远程能力** | ⭐⭐⭐⭐⭐ | ⭐ | 无 bridge/remote/ssh |
| **权限系统** | ⭐⭐⭐⭐⭐ | ⭐⭐ | 仅基础 permisssionManager，缺 YOLO 分类器 |
| **插件系统** | ⭐⭐⭐⭐⭐ | ⭐⭐ | 简单的 plugin-loader，缺 Marketplace |
| **技能系统** | ⭐⭐⭐⭐⭐ | ⭐ | 仅有 skill 命令，缺 skillLearning/skillSearch |
| **计算机使用** | ⭐⭐⭐⭐ | ⭐ | 无 computerUse 模块 |
| **测试覆盖** | ⭐⭐⭐ | ⭐⭐⭐⭐ | mini-v8 单元测试更集中，但覆盖面窄 |
| **构建/CI** | ⭐⭐⭐⭐ | ⭐⭐ | 无 CI、无 feature flag 系统 |

---

## 八、总结

**mini-v8 的核心价值**是提取了主项目的 Agent 系统骨架，包括：
1. Agent runner/registry/memory/team/mailbox
2. 查询循环（query + QueryEngine）
3. 多层对话压缩（microcompact、budget、semantic、snip、reactive）
4. ~35 个核心工具
5. 基础命令框架（13 个命令）
6. 基础 API 客户端（Anthropic + OpenAI + Gemini）

**最大的缺失**是终端 UI（Ink 组件系统）和网络/远程能力（bridge、MCP 客户端、远程服务器），这使得 mini-v8 实际上无法作为独立 CLI 运行，更适合作为：
- Agent 系统的嵌入式库
- API 服务后端
- 自动化测试平台

**如果想缩小差距**，优先级建议：
1. **P0**：接入 MCP 客户端（mcp-client package），实现 MCP 工具完整能力
2. **P1**：补全权限系统（YOLO 分类器），确保安全使用
3. **P2**：添加简单的终端 UI（至少 REPL 循环）
4. **P3**：集成 sessionMemory 持久化，完善压缩系统
