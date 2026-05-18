# P3 优先级路线图

基于第三次差距扫描，推荐以下 P3 工作。

## P3 (高价值)

| 优先级 | 项目 | 估时 | 文件数 | 说明 |
|--------|------|------|--------|------|
| **1** | LSP 工具 + 服务器管理器 | 3h | ~5 | LSPTool + services/lsp/ |
| **2** | Grok 兼容层 | 2h | ~3 | 类似 Gemini 模式 (xAI Grok API) |
| **3** | 记忆增强 (memdir 核心) | 2h | ~3 | findRelevantMemories, memoryAge |
| **4** | add-dir 命令 | 1h | ~1 | `/add-dir <path>` |
| **5** | Grok/Bedrock 提供商 | 2h | ~3 | 更多 API 提供商 |

## P4 (中等价值)

| 优先级 | 项目 | 估时 | 说明 |
|--------|------|------|------|
| **1** | 剩余命令 (~20) | 4h | /history, /fork, /session, /export, /diff 等 |
| **2** | WebBrowserTool | 3h | 需 Playwright 依赖 |
| **3** | Cron 工具 | 2h | 简单调度 |
| **4** | context.ts 修复 | 1h | pre-existing type errors |

## 测试覆盖

当前 568 测试覆盖的主要模块：

| 模块 | 测试数 | 质量 |
|------|--------|------|
| 工具注册表 | 12 | ✅ 完整 |
| 权限规则解析 | 18 | ✅ 完整 |
| 权限加载器 | 10 | ✅ 完整 |
| Agent 任务存储 | ~16 | ✅ |
| Agent 上下文 | ~10 | ✅ |
| Agent 系统 | ~15 | ✅ |
| Agent 内存 | 35 | ✅ (新增 P0#2) |
| query | 8 | ✅ (新增 P0#1) |
| QueryEngine | 12 | ✅ (新增 P0#1) |
| toolExecution | 7 | ✅ (新增 P1#5) |
| toolOrchestration | 8 | ✅ (新增 P1#5) |
| notificationQueue | 10 | ✅ (新增 P1#6) |
| CLI 集成 | 15 | ✅ (新增 P1#7) |
| 日志 | ~30 | ✅ |
| 文件工具 | ~15 | ✅ |
| autoCompact | ~20 | ✅ |

### 仍需测试覆盖的模块

| 模块 | 当前 | 建议 |
|------|------|------|
| `agentRunner.ts` | 部分 (async test) | 增加 sync 测试 |
| `reactiveCompact.ts` | 0 | 基础测试 |
| `toolResultStorage.ts` | 0 | 基础测试 |
| `teammateMailbox.ts` | 0 | 基础测试 |
| `teamManager.ts` | 0 | 基础测试 |
| `agentMemorySnapshot.ts` | 13 | ✅ (新增 P0#2) |

## 性能数据

| 指标 | 值 |
|------|-----|
| 全部测试执行 | ~6-10 秒 |
| tsc --noEmit | ~30 秒 |
| bun run lint | ~5 秒 |
