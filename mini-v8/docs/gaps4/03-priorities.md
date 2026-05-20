# P4 优先级路线图

基于第四次差距扫描的推荐工作。

## 增长统计

| 时间 | 源文件 | 工具 | 测试 | 服务文件 |
|------|--------|------|------|----------|
| gaps1 | ~100 | ~15 | ~200 | ~10 |
| gaps2 | ~150 | ~25 | ~350 | ~20 |
| gaps3 | 195 | 31 | 568 pass | ~30 |
| **gaps4** | **215** | **37** | **待测** | **37** |

## P0 — 延迟工具三件套 (关键)

| 项目 | 估时 | 文件数 | 说明 |
|------|------|--------|------|
| **searchExtraTools/** | 2h | ~4 | TF-IDF 工具索引 + prefetch |
| **SearchExtraToolsTool** | 1h | ~1 | 工具搜索 |
| **SyntheticOutputTool** | 1h | ~1 | 合成输出 |
| **ExecuteTool** | 1h | ~1 | 额外工具执行 |

> 延迟工具链是完整版实现按需工具加载的关键基础设施，依赖 `services/searchExtraTools/toolIndex.ts` 中的 TF-IDF 索引。

## P1 — 高价值补齐

| 项目 | 估时 | 文件数 | 说明 |
|------|------|--------|------|
| **Grok 兼容层** | 2h | ~3 | `services/api/grok/` + client |
| **Worktree 工具** | 2h | ~3 | EnterWorktreeTool + ExitWorktreeTool + worktree utils |
| **REPLTool** | 1.5h | ~1 | REPL 交互执行工具 |
| **PushNotificationTool** | 1h | ~1 | 桌面通知工具 |
| **SnipTool** | 2h | ~2 | 上下文裁剪工具 |
| **MonitorTool** | 1.5h | ~1 | 进程监控工具 |

## P2 — MCP 增强

| 项目 | 估时 | 文件数 | 说明 |
|------|------|--------|------|
| **MCP 连接管理** | 2h | ~3 | MCPConnectionManager + config |
| **MCP 资源工具** | 1.5h | ~2 | ListMcpResources + ReadMcpResource |
| **McpAuthTool** | 1.5h | ~1 | MCP 认证工具 |
| **MCP OAuth** | 2h | ~3 | OAuth 端口 + 认证流程 |

## P3 — 技能与搜索

| 项目 | 估时 | 文件数 | 说明 |
|------|------|--------|------|
| **DiscoverSkillsTool** | 1h | ~1 | 技能发现 |
| **skillSearch/** | 3h | ~7 | 技能搜索服务 (TF-IDF + intent) |
| **CtxInspectTool** | 1.5h | ~1 | 上下文检查工具 |
| **LocalMemoryRecallTool** | 1.5h | ~1 | 本地记忆搜索 |

## P4 — 命令扩展

| 项目 | 估时 | 说明 |
|------|------|------|
| `/cost` | 1h | Token 成本查看 |
| `/context` | 1h | 上下文状态 |
| `/diff` | 1h | Diff 查看 |
| `/login`, `/logout` | 1.5h | 认证 |
| `/rename` | 0.5h | 重命名会话 |
| `/resume` | 1h | 恢复会话 |
| `/init` | 1h | 项目初始化 |
| `/security-review` | 1h | 安全审查 |

## P5 — 不追 (按设计)

- components/ (412 files) — Ink/React UI，mini-v8 使用纯 CLI
- hooks/ (118 files) — React hooks，依赖 Ink
- screens/ (3 files) — Ink 屏幕
- keybindings/ (15 files) — 按键绑定，依赖 Ink
- buddy/ (9 files) — 伴侣 UI
- vim/ (5 files) — Vim 模式
- voice/ (1 file) — 语音
- migrations/ (10 files) — 迁移（仅完整版需要）
- analytics/ (9 files) — 遥测
- skillLearning/ (15 files) — 自动学习（实验功能）
- langfuse/ (5 files) — 第三方集成

## 当前未跟踪的文件

```
?? mini-v8/docs/gaps/00-competitor-analysis.md
?? mini-v8/src/services/cron/
?? mini-v8/src/tools/builtin/CronCreateTool/
?? mini-v8/src/tools/builtin/CronDeleteTool/
?? mini-v8/src/tools/builtin/CronListTool/
```

建议提交这些文件后再继续 P0 工作。
