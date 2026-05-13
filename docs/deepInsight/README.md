# Claude Code Best 深潜分析

> 基于对项目代码与文档的全面扫描与分析，从 6 个核心架构维度归纳总结。

## 文档索引

| 章节 | 文件 | 核心主题 |
|------|------|----------|
| 第 1 章 | [01-Agent-Core-Running-Loop.md](01-Agent-Core-Running-Loop.md) | Agent 核心运行循环：消息准备 → System Prompt 组装 → 流式 API → 工具并发调度 → 异常兜底 |
| 第 2 章 | [02-Multi-Layer-Context-Management.md](02-Multi-Layer-Context-Management.md) | 多层 Context 管理：五层压缩策略 → 八级截断优先级链 → CLAUDE.md 四级加载 |
| 第 3 章 | [03-Memory-System.md](03-Memory-System.md) | Memory 体系：持久化记忆 → 自动提取 → Auto-Dream 巩固 → Hooks 系统 → 指令注入 |
| 第 4 章 | [04-Telemetry-Observability.md](04-Telemetry-Observability.md) | Agent 埋点规范：日志体系 → OTel 追踪 → Analytics 管道 → 评测对齐 |
| 第 5 章 | [05-UX-Performance-Optimization.md](05-UX-Performance-Optimization.md) | C 端体验优化：TTFT → 流式流畅度 → 降级策略 → 静默失败检测 → Cache 断点检测 |
| 第 6 章 | [06-Multi-Agent-Architecture.md](06-Multi-Agent-Architecture.md) | 多 Agent 协作：Fork 子代理 → AgentTool 嵌套 → Coordinator 模式 → 并发子任务 |
| 第 7 章 | [07-Competitive-Analysis.md](07-Competitive-Analysis.md) | 竞品分析对比：Codex CLI / Gemini CLI / Aider / Cline / Goose — 代码规模、功能模块、模型支持 |

## 分析范围

- **源代码目录**：`src/`、`packages/`、`scripts/`
- **文档目录**：`docs/`
- **配置文件**：`package.json`、`tsconfig.json`、`biome.json`
- **关键模块**：`src/query.ts`、`src/QueryEngine.ts`、`src/context.ts`、`src/services/`、`src/utils/`、`packages/builtin-tools/`
