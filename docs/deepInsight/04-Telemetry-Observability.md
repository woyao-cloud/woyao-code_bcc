# Agent 埋点规范与可观测性

## 1. 概述

本项目实现了业界罕见的**三层可观测性体系**——基础日志 + 结构化埋点 + OpenTelemetry 三信号追踪，外加 Perfetto 性能追踪和 SWE-bench 评测对齐。整个体系遵循一系列严格的设计原则：Queue-then-Drain Sink、PII-by-Design 类型系统、双后端路由（Datadog + 1P BigQuery）、Feature Flag 全链路门控。

---

## 2. 日志基础设施

### 2.1 核心日志工具

**`src/utils/log.ts`** — Error Log Sink 模式：

- **延迟绑定**：错误日志在 Sink 附加前进入内部队列（`errorQueue`），`attachErrorLogSink()` 调用后排空。调用是幂等的（已附加则返回）。
- **多目的地路由**：每个错误同时路由到：(1) debug 日志 (2) 内存错误日志（100 条环形缓冲）(3) 持久化错误日志文件（仅内部用户）
- **环境守卫**：Bedrock/Vertex/Foundry Provider + `DISABLE_ERROR_REPORTING` 禁用错误上报
- **`captureAPIRequest()`**：捕获最后一次 API 请求参数（消息内容已剥离以保证隐私）

### 2.2 Debug 日志系统

**`src/utils/debug.ts`**：

| 特性 | 实现 |
|------|------|
| 日志级别 | `verbose < debug < info < warn < error` |
| 激活条件 | `--debug`/`-d` 标志、`DEBUG`/`DEBUG_SDK` 环境变量 |
| 最低级别过滤 | `CLAUDE_CODE_DEBUG_LOG_LEVEL` 环境变量（默认 `debug`） |
| 输出格式 | JSONL：`时间戳 [LEVEL] 消息\n` |
| BufferedWriter | `--debug` 模式同步写，否则缓冲写（1 秒 flush） |
| 测试抑制 | `NODE_ENV === 'test'` 自动抑制（除非 `--debug-to-stderr`） |
| 过滤支持 | `--debug=pattern` 按模式过滤调试输出 |
| Symlink | 维护 `~/.claude/debug/latest` 指向当前会话日志 |

### 2.3 Error Log Sink 实现

**`src/utils/errorLogSink.ts`**：
- `logErrorImpl()`：丰富 axios 错误（URL/状态/Body），记录到 debug 日志 + JSONL 文件，同时上报 Sentry
- `logMCPErrorImpl()` / `logMCPDebugImpl()`：MCP 错误记录到**按服务器命名的** JSONL 日志文件
- JSONL 写工具：基于 `BufferedWriter`，1 秒 flush，最大缓冲 50 条

### 2.4 会话活动追踪

**`src/utils/sessionActivity.ts`**：
- 引用计数的活动追踪，带心跳计时器
- 活动类型：`api_call | tool_exec`
- 每 30 秒触发一次 keep-alive（`CLAUDE_CODE_REMOTE_SEND_KEEPALIVES`）
- 空闲诊断日志（PII-free）

---

## 3. 结构化埋点（Analytics）

### 3.1 架构：Queue-then-Drain Sink

**`src/services/analytics/index.ts`**：
- 无依赖模块（防止循环引用）
- 事件排队直到 `attachAnalyticsSink()` 调用
- 通过 `queueMicrotask()` 排空以避免启动延迟
- **PII-by-Design 类型系统**：
  - `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS`（`never` 类型）：强制开发者显式确认无代码/文件路径
  - `AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED`（`never` 类型）：标记进入 PII 特权访问列的属性

### 3.2 双后端路由

**`src/services/analytics/sink.ts`**：

每个事件同时发送到两个后端：

| 后端 | 适用对象 | PII 处理 |
|------|----------|----------|
| Datadog | 全体用户 | `_PROTO_*` PII 键被剥离 |
| 1P Event Logger (BigQuery) | 内部 | 完整负载（含 PII） |

**采样**：`shouldSampleEvent()` 决定事件是否入围，入围事件附加 `sample_rate`。

### 3.3 Datadog 集成

**`src/services/analytics/datadog.ts`**：

**事件白名单**：仅 68 个特定事件名可进入 Datadog（`DATADOG_ALLOWED_EVENTS` Set），防止敏感数据泄漏。例如：`tengu_api_error`、`tengu_api_success`、`tengu_tool_use_success`、`tengu_compact_failed`。

**基数控制**：
- 用户映射到 30 个固定桶（SHA256 hash），支持去重计数
- MCP 工具名归一化为 `"mcp"`
- 外部模型名映射为规范短名称
- 版本号截断为基础版号+发布日期

**批处理**：最多 100 条 / 批次，每 15 秒 flush，支持优雅退出 flush。

### 3.4 事件元数据丰富

**`src/services/analytics/metadata.ts:693-743`** — `getEventMetadata()` 为每个事件附加：

| 类别 | 字段 |
|------|------|
| 模型 | model, modelType, betas |
| 会话 | sessionId, userType, subscriptionType |
| 环境 | platform, arch, node/bun 版本, terminal, CI, WSL |
| 性能 | uptime, RSS, heapTotal/Used, CPU% |
| 代理 | swarm teammate / subagent / standalone 识别 |
| 评测 | `SWE_BENCH_RUN_ID`, `SWE_BENCH_INSTANCE_ID`, `SWE_BENCH_TASK_ID` |

### 3.5 PII 保护机制

- 所有 analytics metadata value 类型限定为 `boolean | number | undefined`，无 String（防止代码泄漏）
- MCP 工具名 → 哈希为 `"mcp_tool"`
- 插件名/技能名/文件路径 → SHA256 哈希
- `_PROTO_*` 键仅进入 1P BigQuery（特权访问列）

---

## 4. OpenTelemetry 三信号追踪

### 4.1 架构

**`src/utils/telemetry/instrumentation.ts`**：

```
┌─ Metrics ──────────────────────────┐
│ OTLP (grpc/http/protobuf)           │
│ Console / Prometheus                │
│ BigQueryMetricsExporter (自定义)     │
│ 默认导出间隔：60s                   │
└────────────────────────────────────┘
┌─ Logs ────────────────────────────┐
│ OTLP Exporters                     │
│ 默认导出间隔：5s                   │
│ com.anthropic.claude_code.events   │
└────────────────────────────────────┘
┌─ Traces ──────────────────────────┐
│ OTLP Exporters                     │
│ 默认导出间隔：5s                   │
│ 两层追踪：Standard + Beta          │
└────────────────────────────────────┘
```

激活条件：`CLAUDE_CODE_ENABLE_TELEMETRY` 环境变量。优雅关闭超时：2,000ms（可配置）。支持 Proxy/mTLS 配置。

### 4.2 Span 类型系统

**`src/utils/telemetry/sessionTracing.ts:49-55`**：

```
interaction → llm_request → tool → tool.blocked_on_user → tool.execution → hook
```

**AsyncLocalStorage 双上下文**：
- `interactionContext`：用户请求周期的根 Span
- `toolContext`：工具执行的嵌套 Span

**Span 管理**：
- `activeSpans`：`Map<string, WeakRef<SpanContext>>`（可被 GC）
- `strongSpans`：`Map<string, SpanContext>`（生命周期跨 ALS）
- TTL 清理：每 60 秒驱逐超过 30 分钟的 Span，清理过期 WeakRef

### 4.3 关键 Span 操作

| 操作 | 属性 |
|------|------|
| `startInteractionSpan` | 用户 Prompt、Perfetto span |
| `startLLMRequestSpan` | model, querySource, speed |
| `endLLMRequestSpan` | tokens (in/out/cache), duration, success/failure, thinking_output |
| `startToolSpan` | toolName, attributes, toolInput |
| `startToolBlockedOnUserSpan` | 用户等待时间 |
| `endToolSpan` | toolResult, resultTokens |
| `startHookSpan` / `endHookSpan` | hookEvent, hookName, 延迟和结果 |

`executeInSpan()`：通用 Span 包装器——创建 Span → 执行异步函数 → 确保 Span 在成功或错误时结束（含异常记录）。

### 4.4 Beta Session Tracing

**`src/utils/telemetry/betaSessionTracing.ts`**：

**基于哈希的去重**：System Prompt / Messages / Tools 均通过 SHA256 去重，避免重复记录大型内容。

**增量上下文发送**：每个 querySource 维护 `lastReportedMessageHash`，只发送**新增**消息。可见性规则：System Prompt/Model Output 全员可见，Thinking Output 仅内部可见。

**内容截断**：60KB 限制（`MAX_CONTENT_SIZE`），对齐 Honeycomb 的 64KB 限制。

---

## 5. Perfetto 性能追踪

### 5.1 特性

**`src/utils/telemetry/perfettoTracing.ts`**：
- 仅内部功能（`PERFETTO_TRACING` feature gate）
- 输出 Chrome Trace Event 格式 JSON，可在 `ui.perfetto.dev` 或 `chrome://tracing` 中查看
- **代理层级可视化**：父-子跨代理关系，每个代理分配独立的 process/thread ID

### 5.2 性能指标

自动计算并导出：
- **ITPS**（Input Tokens Per Second）
- **OTPS**（Output Tokens Per Second）
- **Cache Hit Rate %**
- 每个 API 调用的重试子 Span 可视化

事件上限：100,000 条（超出后丢弃最旧一半）。支持周期性全量写入和优雅关闭。

---

## 6. 评测对齐

### 6.1 SWE-bench 集成

在所有 Analytics 事件的元数据中包含：
```
sweBenchRunId, sweBenchInstanceId, sweBenchTaskId
```

评测团队可以通过任意维度筛选和聚合。

### 6.2 Shot 统计

`src/utils/stats.ts` — `extractShotCountFromMessages()` 从 `gh pr create` Bash 调用的归因文本中提取 "N-shotted by"。跨会话聚合时按父会话去重（避免子代理重复计数）。

### 6.3 Unary 事件日志

`src/utils/unaryLogging.ts`：记录编辑完成类型（`str_replace_single/multi`、`write_file_single`、`tool_use_single`）和 accept/reject/response 事件。

### 6.4 文件操作分析

`src/utils/fileOperationAnalytics.ts`：记录文件操作类型、文件路径哈希、内容哈希（上限 100KB）。

---

## 7. 成本追踪

### 7.1 模型定价层级

**`src/utils/modelCost.ts:27-69`** 定义了 6 个定价层级：

| 层级 | 模型 | 输入/输出（$/MTok） |
|------|------|---------------------|
| Tier 3/15 | Sonnet 3.5/3.7/4/4.5/4.6 | $3 / $15 |
| Tier 15/75 | Opus 4/4.1 | $15 / $75 |
| Tier 5/25 | Opus 4.5/4.6 普通模式 | $5 / $25 |
| Tier 30/150 | Opus 4.6 快速模式 | $30 / $150 |
| Haiku 3.5 | Haiku 3.5 | $0.80 / $4 |
| Haiku 4.5 | Haiku 4.5 | $1 / $5 |

`calculateUSDCost()` 按 Token 数 × 单价计算，包含缓存读写和 Web Search 费用。

### 7.2 会话级成本累积

**`src/cost-tracker.ts:278-323`**：
- 按模型累计 Token 使用量、成本（USD）
- 递归包含 Advisor 模型成本
- 持久化到项目配置：成本、API 耗时、工具耗时、代码行增删、FPS、模型使用明细
- `useCostSummary()`：注册进程 'exit' 处理器，退出时打印格式化总成本

### 7.3 使用统计聚合

**`src/utils/stats.ts:640-710`**：
- 增量磁盘缓存（当天数据始终实时）
- 追踪维度：总会话数、消息数、活跃天数、连续/最长活跃天数、每日活动、每日模型 Token、最长会话、模型使用明细、峰值活动时段、推测节省时间、Shot 分布

---

## 8. 设计模式总结

### 8.1 Queue-then-Drain Sink

错误日志（`log.ts`）和分析事件（`analytics/index.ts`）均使用"先排队后排空"的 Sink 模式。Sink 附加前事件排队累积；附加后排空队列。附加操作幂等。

### 8.2 PII-by-Design

使用 TypeScript 类型系统强制 PII 审查：
- `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` 作为 `never` 类型
- metadata value 类型仅限 `boolean | number | undefined`（禁止代码泄漏）
- 所有用户自定义名称 → 哈希或归一化

### 8.3 双后端路由

每个事件同时进入 Datadog（去 PII）和 1P BigQuery（完整数据），满足不同访问级别的需求。

### 8.4 Feature Flag 全链路

每个可观测特性由 `feature()`（构建时 Tree-shaking）和/或 GrowthBook（运行时动态配置）双重门控，支持面向内部用户的独占功能（Perfetto/KAIROS/SHOT_STATS）。

### 8.5 增量上下文

Beta 追踪系统通过消息哈希跟踪避免重复发送，仅发送增量（delta/new_context）。
