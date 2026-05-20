# mini-v8 差距分析 — 第四次扫描 (2026-05-19)

## 规模对比

| 指标 | 完整版 src/ | mini-v8 (当前) | 差距 |
|------|-----------|---------------|------|
| .ts 文件数 | 1,732 | 215 | **8.1x** |
| .tsx 文件数 | 550 | 0 | — |
| **总源文件数** | **2,282** | **215** | **10.6x** |
| 顶层目录 | 40 | 16 | **2.5x** |
| 测试文件 | 47 | ~150+ (完整版估算) | **~3.2x** |

注：完整版 .ts/.tsx 文件数为本次扫描实测值。与 gaps3 的差异源于更精准的扫描方式。

## mini-v8 增长趋势

| 指标 | gaps3 (05-18) | gaps4 (05-19) | 变化 |
|------|-------------|-------------|------|
| 源文件数 | 195 | 215 | **+20 (+10.3%)** |
| 内置工具 | 31 | 37 | **+6** |
| 服务文件 | ~30 | 37 | **+7** |
| 命令文件 | 19 | 28 | **+9** |
| 测试文件 | 46 | 47 | **+1** |

## 自 gaps3 以来的新增内容

| 类别 | 新增 | 说明 |
|------|------|------|
| 工具 | +6 | CronCreateTool, CronDeleteTool, CronListTool, LSPTool, WebBrowserTool, PowerShellTool |
| 服务 | cron/scheduler.ts | Cron 调度服务 |
| 服务 | lsp/manager.ts, client.ts | LSP 服务器管理 |
| 服务 | tools/toolOrchestration.ts, toolExecution.ts | 工具编排引擎 |
| 服务 | memory/memdir.ts, findRelevantMemories.ts, memoryAge.ts | 记忆增强 |
| 命令 | addDir, config, doctor, export, fork, history, mcp, session, status | 命令系统扩展 |
| 命令 | registry.ts | 命令注册中心 |
| 测试 | toolsRegistry.test.ts | 工具注册表测试 |

## 工具系统

| 子项 | 值 |
|------|----|
| 内置工具 | **37** (完整版 ~58) |
| 工具目录 | 37 个工具目录 |
| 编排引擎 | ✅ `toolExecution` + `toolOrchestration` |
| 并发执行 | ✅ Slot-based concurrent queue |
| 错误级联 | ✅ Bash 失败取消兄弟工具 |
| 权限规则 | ✅ `permissionRuleParser` + `permissions` + `permissionsLoader` |

### 37 个内置工具清单

```
文件: Bash, Read, Write, Edit, Grep, Glob, ApplyPatch, NotebookEdit
网络: WebFetch, WebSearch, WebBrowser
Agent: Agent, TaskCreate, TaskUpdate, TaskList, TaskGet, TaskOutput, TaskStop
Agent协助: AskUserQuestion, SendMessage, SendUserFile, Sleep
规划: EnterPlanMode, ExitPlanMode, VerifyPlanExecution
配置: Config, Brief
系统: Skill, PowerShell
Cron: CronCreate, CronDelete, CronList
跨: TeamCreate, TeamDelete, MCPTool(工厂)
LSP: LSPTool
```

### 完整版有而 mini-v8 缺失的工具 (25 个)

| 工具 | 说明 | 优先级 |
|------|------|--------|
| **SearchExtraToolsTool** | 延迟工具搜索/按需加载 | P1 |
| **SyntheticOutputTool** | 合成输出（延迟工具配套） | P1 |
| **ExecuteTool** | 执行额外工具 | P1 |
| **EnterWorktreeTool** | 创建 git worktree | P2 |
| **ExitWorktreeTool** | 退出 git worktree | P2 |
| **REPLTool** | REPL 交互执行 | P2 |
| **SnipTool** | 上下文裁剪 | P2 |
| **MonitorTool** | 进程监控 | P2 |
| **PushNotificationTool** | 桌面通知 | P3 |
| **DiscoverSkillsTool** | 技能发现 | P3 |
| **CtxInspectTool** | 上下文检查 | P3 |
| **ListMcpResourcesTool** | MCP 资源列出 | P3 |
| **ReadMcpResourceTool** | MCP 资源读取 | P3 |
| **McpAuthTool** | MCP 认证 | P3 |
| **LocalMemoryRecallTool** | 本地记忆搜索 | P3 |
| **ListPeersTool** | 对等节点发现 | P4 |
| **RemoteTriggerTool** | 远程触发 | P4 |
| **SubscribePRTool** | PR 订阅 | P4 |
| **SuggestBackgroundPRTool** | 后台 PR 建议 | P4 |
| **TerminalCaptureTool** | 终端截图 | P4 |
| **VaultHttpFetchTool** | Vault HTTP | P4 |
| **WorkflowTool** | 工作流执行 | P4 |
| **ReviewArtifactTool** | 制品审查 | P5 |
| **TungstenTool** | Tungsten 渲染 | P5 |
| **OverflowTestTool** | 溢出测试 | P5(测试用) |

## API 提供商

| 提供商 | 完整版 | mini-v8 | 状态 |
|--------|--------|---------|------|
| Anthropic firstParty | ✅ | ✅ | 完整 |
| OpenAI-compatible | ✅ | ✅ | 完整 |
| Gemini | ✅ | ✅ | 完整 |
| Grok | ✅ | ❌ | 缺失 |

## 命令系统

| 子项 | 值 |
|------|----|
| 注册命令 | **27** (完整版 ~99+) |
| 命令文件 | 28 个 .ts |
| 自动注册 | ✅ `commands/registry.ts` |
| 动态分发 | ✅ `dispatchCommand()` |

### 已有命令 (27)

```
/help, /exit, /quit, /q, /clear, /model, /compact,
/plugin, /skill, /memory, /session-memory, /memory-stores, /sync-memory,
/agent, /team, /swarm,
/mcp, /doctor, /permissions, /perm,
/config, /add-dir, /status, /history, /fork, /export, /session
```

### 完整版有而 mini-v8 缺失的命令 (~70+)

高价值 (P3):
- `/cost` — 查看 token 成本
- `/context` — 查看上下文状态
- `/diff` — 查看 diff
- `/login`, `/logout` — 认证
- `/rename` — 重命名会话
- `/resume` — 恢复会话
- `/init` — 项目初始化
- `/security-review` — 安全审查
- `/review` — 代码审查
- `/setup` — 设置向导

## 服务层差距

### 完整版 31 个服务子目录 vs mini-v8 覆盖情况

| 完整版服务 | mini-v8 状态 | 覆盖率 |
|-----------|-------------|--------|
| `acp/` (6 files) | ❌ 无 | 0% |
| `AgentSummary/` (3 files) | ❌ 无 | 0% |
| `analytics/` (9 files) | ❌ 无 | 0% |
| `api/` (30 files) | ⚠️ 仅 claude.ts + openai/ + gemini/ | ~15% |
| `auth/` (2 files) | ⚠️ utils/auth.ts | ~30% |
| `autoDream/` (4 files) | ❌ 无 | 0% |
| `compact/` (16 files) | ⚠️ 仅 autoCompact + reactiveCompact | ~13% |
| `config/` | ✅ configManager.ts | ~80% |
| `contextCollapse/` (3 files) | ❌ 无 | 0% |
| `extractMemories/` (2 files) | ❌ 无 | 0% |
| `langfuse/` (5 files) | ❌ 无 | 0% |
| `localVault/` (2 files) | ❌ 无 | 0% |
| `lsp/` (8 files) | ⚠️ 仅 client + manager | ~25% |
| `MagicDocs/` (2 files) | ❌ 无 | 0% |
| `mcp/` (26 files) | ⚠️ 仅 mcpClient.ts | ~4% |
| `memory/` | ⚠️ 有基础实现 | ~50% |
| `messages/` | ⚠️ 仅 apiProjection.ts | ~50% |
| `oauth/` (6 files) | ❌ 无 | 0% |
| `permission/` | ⚠️ 有基础实现 | ~60% |
| `plugins/` (3 files) | ⚠️ utils 层有 | ~40% |
| `policyLimits/` (2 files) | ❌ 无 | 0% |
| `PromptSuggestion/` (2 files) | ❌ 无 | 0% |
| `providerRegistry/` (4 files) | ❌ 无 | 0% |
| `providerUsage/` (6 files) | ❌ 无 | 0% |
| `searchExtraTools/` (2 files) | ❌ 无 | 0% |
| `SessionMemory/` (4 files) | ⚠️ 有 sessionMemory.ts | ~40% |
| `sessionTranscript/` (1 file) | ❌ 无 | 0% |
| `settingsSync/` (2 files) | ❌ 无 | 0% |
| `skillLearning/` (15 files) | ❌ 无 | 0% |
| `skillSearch/` (7 files) | ❌ 无 | 0% |
| `teamMemorySync/` (5 files) | ⚠️ 仅 teamMemorySync.ts | ~20% |
| `tips/` (4 files) | ❌ 无 | 0% |
| `tools/` (4 files) | ⚠️ 仅 toolExecution + toolOrchestration | ~50% |
| `toolUseSummary/` (1 file) | ❌ 无 | 0% |
| `session/` | ✅ sessionStore.ts | ~100% |
| `cron/` | ✅ scheduler.ts | ~100% |

### 根级服务文件 (17 个)

| 文件 | mini-v8 状态 |
|------|-------------|
| `planMode.ts` | ✅ 有 |
| `retry.ts` | ✅ 有 |
| `taskStore.ts` | ✅ 有 |
| `notificationQueue.ts` | ✅ 有 |
| `toolResultStorage.ts` | ✅ 有 |
| 其余 12 个 (awaySummary, claudeAiLimits, diagnosticTracking, doubaoSTT, internalLogging, mcpServerApproval, mockRateLimits, notifier, preventSleep, rateLimitMessages, tokenEstimation, vcr, voice, voiceKeyterms, voiceStreamSTT) | ❌ 无 |

## 完整版有而 mini-v8 没有的目录

| 目录 | 文件数 | 说明 |
|------|--------|------|
| `components/` | 412 | Ink/React UI (P5 不追) |
| `hooks/` | 118 | React hooks (P5 不追) |
| `bridge/` | 36 | Remote Control (P4) |
| `skills/` | 26 | 技能系统 (P3) |
| `tasks/` | 14 | 任务类型 (P3) |
| `state/` | 6 | Zustand store (P3) |
| `keybindings/` | 15 | 按键绑定 (P5 不追) |
| `memdir/` (原生) | 9 | 记忆目录 (已迁移到 services/memory/) |
| `ssh/` | 6 | SSH 会话 (P4) |
| `remote/` | 4 | 远程会话 (P4) |
| `daemon/` | 5 | 长驻进程 (P5) |
| `server/` | 11 | Direct Connect (P4) |
| `screens/` | 3 | Ink 屏幕 (P5 不追) |
| `coordinator/` | 2 | 协调器 (P4) |
| `assistant/` | 6 | Assistant (P4) |
| `jobs/` | 6 | 任务模板 (P4) |
| `buddy/` | 9 | 伴侣 UI (P5 不追) |
| `vim/` | 5 | Vim 模式 (P5 不追) |
| `voice/` | 1 | 语音 (P5 不追) |
| `migrations/` | 10 | 迁移脚本 (P5) |
| `proactive/` | 3 | 主动建议 (P5) |
| `upstreamproxy/` | 2 | 代理 (P5) |
| `environment-runner/` | 1 | BYOC (P5) |
| `plugins/` (原生) | 3 | 插件系统 (已迁移到 mini-v8 plugins/) |

## utils/ 差距

mini-v8 utils/ 有 28 个文件，完整版 utils/ 有 340+ 文件 + 32 个子目录。

**关键缺口 (P2-P3):**
- `bash/` (15 files) — Bash 解析/前缀/引号处理
- `permissions/` (24 files) — 权限分类器/规则匹配
- `plugins/` (42 files) — 插件生态
- `model/` (17 files) — 模型配置/能力检测
- `hooks/` (17 files) — Hook 注册/执行
- `settings/` (16 files) — 设置验证/迁移
- `swarm/` (23 files) — 多 Agent 集群
- `shell/` (10 files) — Shell provider
- `git/` (3 files) — git 配置/ignore
- `telemetry/` (9 files) — 遥测

## 代码质量快照

(需执行 `bun test` 和 `tsc --noEmit` 获取最新数据)

## 总结

mini-v8 在 24 小时内增长了 **10.3%**（195→215 文件）。主要进展：
1. **Cron 工具** — 3 个 Cron 工具 + 调度服务
2. **LSP 集成** — LSPTool + lsp 服务
3. **命令扩展** — +9 个新命令，命令注册中心
4. **记忆增强** — memdir, findRelevantMemories, memoryAge
5. **工具编排** — toolExecution, toolOrchestration

最关键的剩余差距：
1. **SearchExtraTools + SyntheticOutput + Execute** (延迟工具三件套)
2. **Grok 兼容层**
3. **Worktree 工具** (EnterWorktree, ExitWorktree)
4. **MCP 增强** (资源、认证、OAuth)
5. **技能发现系统** (DiscoverSkills, skillSearch)
