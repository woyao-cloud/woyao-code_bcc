# mini-v8 差距分析 — 第三次扫描 (2026-05-18)

## 规模对比

| 指标 | 完整版 src/ | mini-v8 (当前) | 差距 |
|------|-----------|---------------|------|
| .ts 文件数 | 1,925 | 195 | **9.9x** |
| .tsx 文件数 | 357 | 0 | — |
| **总文件数** | **2,282** | **195** | **11.7x** |
| 顶层目录 | 40 | 15 | **2.7x** |
| 测试文件 | ~150+ | 46 | **~3.3x** |
| 测试通过 | — | **568 / 568** | **100%** |
| TypeScript 错误 | — | **38** (全部预存在测试文件中) | — |

## 代码质量

| 指标 | 当前值 |
|------|--------|
| 测试总数 | **568 pass, 0 fail** |
| expect() 调用 | **1,372** |
| 测试文件数 | **46** |
| 测试耗时 | **~6 秒** |
| tsc --noEmit | 38 errors (全部在 `__tests__/`, 源自 `mock.module` 类型推断限制) |
| biome lint | 通过 |

## 工具系统

| 子项 | 值 |
|------|----|
| 内置工具 | **31** (完整版 ~60) |
| 工具目录 | 32 个文件 (含 MCPTool 工厂) |
| 编排引擎 | ✅ `toolExecution` + `toolOrchestration` |
| 并发执行 | ✅ Slot-based concurrent queue (max 5) |
| 错误级联 | ✅ Bash 失败取消兄弟工具 |
| 权限规则 | ✅ `permissionRuleParser` + `permissions` |

### 31 个内置工具清单

```
文件: Bash, Read, Write, Edit, Grep, Glob, ApplyPatch
网络: WebFetch, WebSearch
Agent: Agent, TaskCreate, TaskUpdate, TaskList, TaskGet, TaskOutput, TaskStop
Agent协助: TodoWrite, AskUserQuestion, SendMessage, SendUserFile, Sleep
规划: EnterPlanMode, ExitPlanMode, VerifyPlanExecution
配置: Config, Brief
系统: Skill, PowerShell, NotebookEdit
跨: TeamCreate, TeamDelete, MCPTool(工厂)
```

## API 提供商

| 提供商 | 状态 |
|--------|------|
| Anthropic firstParty | ✅ |
| OpenAI-compatible | ✅ |
| Gemini | ✅ (新增于 P0#3) |

## 命令系统

| 子项 | 值 |
|------|----|
| 注册命令 | **17** |
| 命令文件 | 19 个 .ts (不含 `__tests__`) |
| 自动注册 | ✅ `commands/registry.ts` |
| 动态分发 | ✅ `dispatchCommand()` |

### 已注册命令

```
/help, /exit, /quit, /q, /clear, /model, /compact,
/plugin, /skill, /memory, /session-memory, /memory-stores, /sync-memory,
/agent, /team, /swarm,
/mcp, /doctor, /permissions, /perm
```

## 已追平的功能 (自 gaps2 以来新增)

| 功能 | 变化 | 时间 |
|------|------|------|
| query / QueryEngine 测试 | +20 tests | P0#1 |
| agentMemory + snapshot 测试 | +35 tests | P0#2 |
| Gemini 兼容层 | +3 files | P0#3 |
| 命令自动注册系统 | +10 files, cli.ts -190 lines | P1#1 |
| /mcp, /doctor, /permissions 命令 | +3 commands | P1#2/3/4 |
| 编排引擎测试 | +15 tests | P1#5 |
| 通知系统测试 | +10 tests | P1#6 |
| 集成测试 + parseCLIArgs | +15 tests | P1#7 |
| Slot-based 并发, 错误级联 | toolOrchestration 增强 | P2#1/3 |
| permissionsLoader 测试 + setter | +10 tests | P2#2 |
| NotebookEditTool, bundled plugins, MCP skill builder | +3 files | P2#4/5/6 |

**测试增长**: 483 → 568 (+85 tests, +17.6%)

## 完整版有而 mini-v8 没有的目录 (27 个)

| 目录 | 文件数 | 说明 | 优先级 |
|------|--------|------|--------|
| `components/` | 412 | Ink/React UI 组件 | P5(不追) |
| `hooks/` | 118 | React hooks | P5(不追) |
| `commands/` (剩余) | ~360 | 100+ 额外子命令 | P4 |
| `utils/` (剩余) | ~730 | git/permissions/shell/swarm 工具 | P2-P4 |
| `bridge/` | 40 | Remote Control / Bridge | P4 |
| `cli/` (剩余) | ~36 | CLI 传输/后台会话/打印 | P4 |
| `skills/` | 23 | Skill 加载/MCP Skill | P3 |
| `services/` (剩余) | ~244 | 见 services 差距 | P2-P4 |
| `keybindings/` | 15 | 按键绑定 | P5(不追) |
| `state/` | 7 | Zustand store | P3 |
| `tasks/` | 15 | DreamTask/LocalAgentTask 等 | P3 |
| `server/` | 11 | Direct Connect | P4 |
| `screens/` | 3 | REPL/Doctor/Resume (Ink) | P5(不追) |
| `memdir/` | 9 | 记忆目录 | P3 |
| `migrations/` | 10 | 迁移脚本 | P5 |
| `vim/` | 5 | Vim 模式 | P5(不追) |
| `voice/` | 1 | 语音 | P5(不追) |
| `daemon/` | 5 | 长驻进程 | P5 |
| `coordinator/` | 2 | 协调器 | P4 |
| `ssh/` | 6 | SSH 会话 | P4 |
| `remote/` | 4 | 远程会话 | P4 |
| `assistant/` | 6 | Assistant 管理 | P4 |
| `proactive/` | 3 | 主动建议 | P5 |
| `jobs/` | 6 | 任务模板分类 | P4 |
| `buddy/` | 9 | 伴侣 UI | P5(不追) |
| `upstreamproxy/` | 2 | 代理 | P5 |
| `environment-runner/` | 1 | BYOC | P5 |

## 核心差距分析

### 高价值 (P3)

| 项目 | 估时 | 说明 |
|------|------|------|
| **LSPTool** | ~150 行 | LSP 服务器集成 — 代码智能核心 |
| **增强记忆系统** (memdir) | ~200 行 | findRelevantMemories, memoryAge 等 |
| **add-dir 命令** | ~100 行 | `/add-dir` 添加额外工作目录 |
| **Grok 兼容层** | ~150 行 | 类似 Gemini 模式，xAI Grok API |
| **config 命令增强** | ~100 行 | 设置工具已有，命令可增强 |

### 中等价值 (P4)

| 项目 | 估时 | 说明 |
|------|------|------|
| **剩余 ~20 个命令** | ~400 行 | `/config`, `/session`, `/history`, `/fork` 等 |
| **toolUseSummary** | ~200 行 | 工具使用摘要生成 |
| **剩余 ~30 个工具** | ~600 行 | WebBrowser, Cron, Worktree 等 |
| **Bridge 支持** | ~1000 行 | 大功能模块 |
| **SSH 会话** | ~500 行 | Remote 开发 |

### 低价值/不追 (P5)

- Ink/React UI (components, hooks, screens, screens) — mini 使用纯 CLI 是有意设计决策
- Vim 模式, 语音模式, Buddy 伴侣 UI, 按键绑定系统
- 巨型编译/压缩系统 (compact.ts 1751 行)
- Bridge/Daemon/Server 等网络功能

## 剩余 TypeScript 错误 (38 个)

全部 38 个错误都在 `__tests__/` 中，原因：
- `mock.module` 的类型推断限制 (treats `mock` as `unknown`)
- `ContentItem` 联合类型上的 `is_error`/`tool_use_id` 属性访问 (需 `as` 转换)
- `BetaMessageParam` 的字面量类型 `role` 不匹配 `string`

**生产代码零错误。** 测试文件中的 tsc 错误不影响 `bun test` 运行。
