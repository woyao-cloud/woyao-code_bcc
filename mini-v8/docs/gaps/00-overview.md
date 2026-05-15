# mini-v8 vs 完整版 src 差距总览

## 规模对比

| 维度 | 完整版 src | mini-v8 | 比例 |
|------|-----------|---------|------|
| 源文件总数 | ~2,280 | ~156 | **6.8%** |
| 工具数量 | ~53 | 19 | **36%** |
| 服务模块数 | 20 | 10 | **50%** |
| API Provider | 7 | 2 | **29%** |
| UI 组件目录 | 32 | 0 | **0%** |
| React Hooks | ~90 | 0 | **0%** |
| Slash Commands | ~100 | 4 | **4%** |
| 任务类型 | 7 | 1 (内存) | **14%** |

## 相似之处

mini-v8 在以下方面与完整版保持了较高的一致性：

1. **核心概念模型** — Agent 定义、Tool 接口、Memory 分层（local/cloud/session/team）、MCP 连接、Skill 加载等核心抽象与完整版一致
2. **Agent 系统** — 完整保留了 Agent 注册/发现/运行/团队协作的核心循环，6 个内置 Agent 定义与完整版同名
3. **Memory 模块** — 是覆盖最完整的服务模块，四层记忆体系（local/cloud/session/team）均有实现，team memory sync 含增量同步
4. **消息投影管道** — `projectMessagesForAPI` 实现了 compaction → budget → trim 的完整链路
5. **Tool 接口设计** — Tool/ ToolUseContext/ ToolResult 的类型结构与完整版语义一致，ToolRegistry 模式更清晰
6. **API 流式调用** — Anthropic + OpenAI 双 provider 的流式调用与完整版架构相同

## 差距最大的方面

### 1. UI 层（差距: 100%）
mini-v8 **完全没有 UI 层**。完整版基于 Ink (React for CLI) 构建了完整的 TUI 应用（32 个组件目录、~90 个 hooks、REPL/Doctor 全屏视图、权限对话框、模糊搜索选择器等），mini-v8 是纯命令行管道模式。

### 2. 企业级基础设施（差距: ~95%）
- 无 Analytics/Telemetry（Datadog, GrowthBook）
- 无 ACP 协议支持
- 无 Langfuse 可观测性
- 无 LSP 集成
- 无 Voice/STT
- 无 Cron/调度系统
- 无 Daemon 长驻模式
- 无 Bridge/Remote Control
- 无 SSH Remote

### 3. 工具生态（差距: 64%）
缺失 34 个工具，涵盖：Cron 调度、Notebook 编辑、LSP、Worktree、PowerShell、Monitor、桌面通知、Web Browser、Plan Mode V2、Task Stop/Output 等。

### 4. MCP 实现（差距: 97%）
完整版 31 个文件（auth/channels/registry/OAuth/XAA），mini-v8 仅 1 个文件（stdio 子进程），无权限通道、无 MCP 资源读写、无 OAuth 认证。

### 5. Compaction 管线（差距: 95%）
完整版 21 文件（缓存微压缩/分组压缩/截断/反应式压缩/时间感知），mini-v8 仅 1 文件。缺失：基于时间的压缩策略、缓存微压缩、截断式压缩投影。

### 6. Skill 体系（差距: 96%）
完整版 51 文件（skillLearning 39 文件 + skillSearch 12 文件），含自进化/观察/本能/生成/节流等。mini-v8 仅 2 文件（基础 store + loader），只有"Skill 即插件"模式。

### 7. 任务系统（差距: 86%）
完整版 7 种任务类型 + 磁盘持久化 + lockfile 并发控制 + 信号通知。mini-v8 仅内存 Map + 基础 CRUD。

## 架构差异总结

```
完整版 src/ 架构:
  entrypoints → CLI handlers → Ink UI (components/hooks/screens)
                            → services (20 模块)
                            → tools (~53)
                            → bridge/remote/ACP
                            → coordinator/swarm
                            → analytics/telemetry
                            → cron/daemon/SSH

mini-v8 架构:
  entrypoints → commands → services (10 模块)
                         → tools (19)
                         → agents (registry/runner/team)
```

mini-v8 是一个"核心引擎"版的 Claude Code — 保留了 LLM 对话循环、工具调用、Agent 协作和记忆管理的最小可用子集，剥离了全部 UI、全部企业级功能、绝大多数工具和几乎全部基础设施。

## 各维度详细分析

| 文档 | 内容 |
|------|------|
| [01-tools-comparison.md](01-tools-comparison.md) | 工具系统详细对比 |
| [02-services-comparison.md](02-services-comparison.md) | 服务层详细对比 |
| [03-ui-layer-comparison.md](03-ui-layer-comparison.md) | UI 组件层对比 |
| [04-query-api-comparison.md](04-query-api-comparison.md) | 查询引擎与 API 层对比 |
| [05-agent-task-system.md](05-agent-task-system.md) | Agent 与任务系统对比 |
