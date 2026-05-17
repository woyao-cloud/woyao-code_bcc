# 命令系统差距分析

## 现状

mini-v8 仅有 4 个命令文件 (5 个命令实现)，完整版有 **115+ 子命令** 约 **387 文件**。

### mini-v8 现有命令

| 命令 | 文件 | 行数估 | 说明 |
|------|------|--------|------|
| `/agent` | `agentCommands.ts` | ~100 | agent 管理 (list/add) |
| `/memory` | `memoryCommands.ts` | ~150 | 内存管理 (extract, search) |
| `/plugin` | `pluginCommands.ts` | ~80 | 插件管理 |
| `/skill` | `skillCommands.ts` | ~80 | 技能搜索 |

### 完整版有而 mini 没有的关键命令

| 命令优先级 | 估量 | 行数 | 说明 |
|-----------|------|------|------|
| **P0** `/mcp` | 中 | ~200 | MCP 服务器管理 (serve/add/remove/list) |
| **P0** `/model` | 低 | ~50 | 运行时切换模型 |
| **P0** `/doctor` | 中 | ~150 | 诊断系统健康状态 |
| **P0** `/update` | 低 | ~80 | 检查/应用更新 |
| **P0** `/clear` | 低 | ~20 | 清除对话 (已有 `/clear` 在 cli.ts 中硬编码) |
| **P1** `/compact` | 低 | ~40 | 手动触发压缩 (已在 cli.ts 中硬编码) |
| **P1** `/permissions` | 中 | ~150 | 权限规则管理 (list/add/remove) |
| **P1** `/config` | 中 | ~100 | 配置管理 (set/get) |
| **P1** `/auth` | 中 | ~100 | 认证管理 (login/logout/status) |
| **P1** `/history` | 中 | ~100 | 会话历史 |
| **P2** `/plan` | 高 | ~200 | Plan 模式 |
| **P2** `/tasks` | 中 | ~100 | 后台任务管理 |
| **P2** `/swarm` | 中 | ~100 | Swarm 协调 |
| **P2** `/team` | 中 | ~100 | 团队管理 |
| **P2** `/session` | 中 | ~80 | 会话管理 |
| **P3** `/ssh`/`/server` | 高 | ~200+ | SSH/Server 远程会话 |
| **P3** `/fork` | 中 | ~80 | Fork 工作区 |
| **P3** `/help` | 低 | ~30 | 帮助 (已在 cli.ts 中硬编码) |
| **P4** `/review` | 中 | ~150 | PR/代码审查 |
| **P4** `/schedule` | 中 | ~150 | 定时任务 (cron) |
| **P5** `/buddy`/`/fast`/`/effort` | 高 | ~300 | UI 辅助功能 |

## 基础设施

完整版命令通过 `src/main.tsx` (Commander.js) 定义。每个命令目录包含：

```
commands/<name>/
├── index.ts          — Handler export
├── render.tsx        — Ink 渲染 (如有)
└── __tests__/        — 测试
```

mini-v8 当前在 `cli.ts` 中硬编码命令路由（简单的 `if (line.startsWith('/xxx'))`），结构简单但扩张不便。建议在 `commands/` 下增加统一的命令注册系统。

## 推荐

- P0 命令自动注册系统（从 `commands/` 目录自动发现 handler）
- 优先实现 `/mcp`、`/doctor`、`/permissions`、`/config` 命令
