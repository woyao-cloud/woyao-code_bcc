# mini-v8 vs 完整版 src/ 差距分析 — 总览

## 规模对比

| 指标 | 完整版 src/ | mini-v8 | 比例 |
|------|-----------|---------|------|
| .ts/.tsx 文件数 | 2,024 | 164 | **12.3x** |
| 顶层目录数 | 39 | 14 | **2.8x** |
| 内置工具数 | ~60 | 30 | **2x** |
| API providers | 7 | 2 | **3.5x** |
| 测试文件 | ~150+ | 31 | **~5x** |

## 目录级对比

### mini-v8 已有的目录

| 目录 | 文件数 | 与完整版差距 |
|------|--------|-------------|
| `agents/` | 10 | 完整版在 `commands/agents/` + `coordinator/`，mini 更集中 |
| `bootstrap/` | 1 | 基本一致 (`state.ts`) |
| `commands/` | 5 | 完整版 **387** 文件 (115+ 子命令)，mini 仅 4 个命令 |
| `constants/` | 4 | 完整版 25 文件，mini 有核心子集 |
| `entrypoints/` | 1 | 完整版 17 文件 (含 SDK/agent 类型) |
| `plugins/` | 7 | 完整版 3 文件 (打包为内置)，mini 更外部化 |
| `query/` | 1 | 完整版 5 文件 (含 deps/di, tokenBudget, stopHooks) |
| `services/` | 33 | 完整版 115 文件 (含 LSP/MagicDocs/Langfuse/VCR 等) |
| `tools/` | 32 | 完整版 60 工具 + 编排引擎 |
| `types/` | 6 | 完整版 25 文件 (含生成的类型) |
| `utils/` | 31 | 完整版 **770** 文件 (最大的"杂项抽屉") |

### 完整版有而 mini-v8 没有的目录

| 目录 | 文件数 | 说明 | 优先级 |
|------|--------|------|--------|
| `components/` | 412 | Ink/React UI 组件 (权限弹窗、消息渲染、设计系统) | P5 |
| `hooks/` | 118 | React hooks (permissions, suggestions, settings) | P5 |
| `commands/` (子命令) | 382+ | 115+ 子命令实现 | P4 |
| `utils/` (子目录) | 740+ | model/permissions/git/settings/shell/swarm 等 | P2-P4 |
| `bridge/` | 40 | Remote Control / Bridge 模式 | P4 |
| `cli/` | 37 | CLI 传输层、后台会话、打印 | P4 |
| `skills/` | 26 | Skill 加载 + MCP Skill 构建器 | P3 |
| `services/` (子目录) | 80+ | analytics, compact, lsp, MagicDocs, langfuse, oauth 等 | P2-P4 |
| `keybindings/` | 15 | 自定义按键绑定系统 | P5 |
| `state/` | 7 | Zustand store + AppState | P5 |
| `tasks/` | 15 | DreamTask, LocalAgentTask, RemoteAgentTask 等 | P3 |
| `types/` (生成) | 25 | SDK 类型定义 | P5 |
| `server/` | 11 | Direct Connect 服务器 | P4 |
| `constants/` (缺少) | 21 | apiLimits, systemPromptSections, xml 等 | P3 |
| `screens/` | 3 | REPL, Doctor, ResumeConversation (Ink) | P5 |
| `memdir/` | 9 | 内存目录系统 | P3 |

## 已完成的工作 (已追平)

以下功能 gap analysis 中已标记完成的模块：

- **Agent 系统** — 完整的 AsyncAgent 执行、ALS 上下文隔离、Agent Memory、Mailbox、Notifications
- **查询引擎** — query() async generator + QueryEngine 编排器 + autoCompact + reactiveCompact + max_tokens 恢复
- **工具系统** — Tool 接口升级 + 注册表重构 + 30 工具 + 编排引擎 + 权限规则系统
- **紧凑子系统** — microcompact + tool result budget + autoCompact + reactiveCompact

## 尚未处理的主要差距

| 类别 | 估量 | 说明 |
|------|------|------|
| UI/渲染层 | ~500 文件 | Ink/React 组件、hooks、screens — mini 使用纯 readline |
| 命令系统 | ~380 文件 | 多 /command 实现 — mini 仅有 4 个 |
| 工具差距 | ~30 工具 | WebBrowser, LSP, Cron, Worktree, Config, MCP 增强 |
| API 提供商 | +5 | Bedrock, Vertex, Foundry, Gemini, Grok |
| 错误恢复 | 部分 | max_tokens 恢复已完成，prompt_suggestion/memory 提取未完成 |
| 测试覆盖率 | ~120 文件 | mini 仅 31 测试文件 |
