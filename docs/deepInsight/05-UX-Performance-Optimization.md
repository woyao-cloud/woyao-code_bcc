# C 端体验关键指标优化

## 1. 概述

C 端（Client-Side/终端用户）体验优化是 AI CLI 产品的核心竞争力。本项目围绕六个关键指标进行了深度优化：首 Token 延迟、流式输出流畅度、工具失败降级、静默失败检测、启动时间和权限交互 UX。每一项优化都体现了对用户感知延迟的极致追求。

---

## 2. 首 Token 延迟（TTFT）优化

### 2.1 TTFT 精确测量

`src/services/api/claude.ts` 在 `queryModel()` 中实现精确的 TTFT 测量：

- 变量声明（L1841）：`let ttftMs = 0`
- 记录时机（L2058-2061）：`message_start` 事件到达时 `ttftMs = Date.now() - start`
- 首个 chunk 触发 checkpoint（L2051-2056）：`queryCheckpoint('query_first_chunk_received')`
- 注入 Langfuse Observation 和 `logAPISuccessAndDuration` telemetry

### 2.2 Prompt Caching 策略

**`src/services/api/claude.ts:328-429`** — 多层级缓存配置：

| 配置项 | 控制方式 |
|--------|----------|
| 全局启用/禁用 | `getPromptCachingEnabled(model)` |
| 按模型禁用 | `DISABLE_PROMPT_CACHING_{HAIKU,SONNET,OPUS}` 环境变量 |
| 1h TTL 白名单 | `tengu_prompt_cache_1h_config` GrowthBook + 允许列表匹配 |
| TTL 锁存 | 入口时快照 `getPromptCache1hEligible()` 确保会话稳定性 |

**缓存控制对象**：`type: 'ephemeral'` + 可选的 `ttl: '1h'` + `scope: 'global'`。

### 2.3 缓存断点布局

`addCacheBreakpoints()`（`claude.ts:3201-3350`）：
- 每请求仅放置**一个消息级** `cache_control` 标记
- 位置：最后一条消息（`skipCacheWrite` Fork → 倒数第二条）
- 避免重复 KV 页驱逐

`buildSystemPromptBlocks()`（`claude.ts:3352-3370`）：
- 将 System Prompt 拆分为结构化 `system` 数组
- 按 `splitSysPromptPrefix()` 添加逐块 `cache_control`
- MCP 工具存在 → 切换到非全局缓存策略

### 2.4 原始流优化

不使用官方 `BetaMessageStream`（每 Delta 触发 O(n²) 的部分 JSON 解析），直接使用 `anthropic.beta.messages.create({ stream: true }).withResponse()` 获取原始事件流，手动管理工具输入累积。

---

## 3. 流式输出流畅度

### 3.1 Ink 渲染层优化

**`packages/@ant/ink/src/core/renderer.ts:38-46`**：
- **字符缓存**：每个唯一行的 tokenize + grapheme 聚类结果被缓存（`charCache`）
- 帧间复用渲染输出，大多行无需重新计算
- 每字符热循环仅包含属性读取

**`packages/@ant/ink/src/core/output.ts:30-51`**：
- `ClusteredChar` 类型：预计算终端宽度、styleId、超链接
- Screen 与前一帧 diff 后仅产出变更部分的终端更新
- **16ms 渲染节流**（Ink 内置）：快速批量更新被自然聚合

### 3.2 流式文本显示策略

**`src/screens/REPL.tsx:1761-1780`**：

```typescript
// 隐藏正在进行的源码行，使文本按行流式展示而非逐字符
visibleStreamingText = streamingText.substring(
  0, streamingText.lastIndexOf('\n') + 1
)
```

- 禁用条件：`reducedMotion` 偏好 或 终端光标回滚 Bug
- 文本 Delta 累积通过 `Map<number, string[]>` 实现，避免 O(n²) 拼接

### 3.3 停顿检测

`claude.ts:2014-2047`：30 秒停顿阈值（`STALL_THRESHOLD_MS`）。仅计首次事件之后（排除 TTFB）。每个停顿累计总停顿时长，流式结束后产出摘要事件。

---

## 4. 工具失败的降级策略

### 4.1 Bash Tool 错误处理

**`packages/builtin-tools/src/tools/BashTool/BashTool.tsx:679-753`**：

- 退出码**不被视为错误**：模型接收 `stdout`, `stderr`, `exitCode` 结构化字段自行应对
- 中断追加 `<error>Command was aborted before completion</error>`
- 仅中断标记 `is_error`
- `interpretCommandResult()` 提供语义解读

### 4.2 输出截断

- `formatOutput()` 截断超出 `getMaxOutputLength()` 的内容
- `resetCwdIfOutsideProject()` 自动恢复越界的工作目录
- 附加 Shell 重置通知

### 4.3 权限拒绝降级

权限决策链（`src/utils/permissions/permissions.ts:1179-1340`）：
1. 拒绝规则 → 立即拒绝
2. 安全校验（`.git/`, `.claude/`, Shell 配置）→ **绕过免疫**
3. bypassPermissions → 自动允许（安全校验除外）
4. AcceptEdits 快速路径 → 预检查常见安全操作
5. Classifier 不可用时的铁门模式（fail-closed + 重试引导）

### 4.4 Classifier 超限处理

当 Classifier transcript 超出上下文窗口时：
- 交互模式 → 回退到正常提示
- Headless 模式 → **完整中止代理**（防止 deny-retry-deny 死循环）

---

## 5. 静默失败的检测与兜底

### 5.1 流空闲看门狗

**`src/services/api/claude.ts:1948-1994`**：

SDK 请求超时仅覆盖初始 `fetch()`，不监控流式 Body。本项目实现了两个计时器：

| 计时器 | 阈值 | 动作 |
|--------|------|------|
| 警告 | 45 秒 | 日志记录 |
| 强制终止 | 90 秒 | 中止流 + 触发非流式回退 |

- `streamIdleAborted = true` → 抛出 `'Stream idle timeout - no chunks received'`
- 退出延迟检测区分真实挂起与错误退出

### 5.2 会话活动心跳

**`src/utils/sessionActivity.ts`**：
- 每 30 秒触发心跳回调（远程传输注册自己的 keep-alive 发送器）
- 引用计数管理：`startSessionActivity()` → 0→1 时启动计时器；`stopSessionActivity()` → 1→0 时停止 + 启动空闲计时器（30 秒后日志）
- 关闭时报告最终活动状态

### 5.3 Container Idle-Kill 防护

远程会话（CCR）的非流式回退超时默认 **120 秒**，低于 CCR 的 ~5 分钟容器空闲终止阈值。

### 5.4 持久重试模式心跳

**`src/services/api/withRetry.ts:477-512`**：
- 将长时间等待切分为 30 秒块
- 每个块产出 `SystemAPIErrorMessage` 保持 stdout 活跃
- 防止主机标记会话空闲

### 5.5 Bash 超时保护

- 默认超时：120 秒（`DEFAULT_TIMEOUT_MS`）
- 最大超时：600 秒（`MAX_TIMEOUT_MS`）
- 通过环境变量可配置

---

## 6. 启动时间优化

### 6.1 快速路径架构

**`src/entrypoints/cli.tsx:76-378`** — 所有 import 均为**动态加载**，最小化快速命令的模块评估：

```
--version / -v / -V → 仅读取 MACRO.VERSION（零模块加载）
--dump-system-prompt → 仅加载 configs + model + prompt
--claude-in-chrome-mcp → 仅加载对应模块
--acp → 仅加载 ACP entrypoint
--daemon-worker → 精简 Worker 启动
environment-runner → BYOC Runner 路径
--worktree --tmux → exec 到 tmux 后才加载完整 CLI
```

### 6.2 Performance Shim

`src/entrypoints/cli.tsx:2-5` — `performanceShim.js` 必须是**第一个导入项**，在 React/OTel 捕获原生引用之前替换 `globalThis.performance`，防止 JSC C++ Vector 在长生命周期内无限增长。

### 6.3 Heap 优化

远程（CCR）环境：子进程 `--max-old-space-size=8192`（16GB 容器）。

### 6.4 启动分析器

`src/utils/startupProfiler.ts`：
- 两种模式：详细分析（`CLAUDE_CODE_PROFILE_STARTUP=1`，含内存快照）；抽样 Statsig 日志（100% 内部用户，0.5% 外部用户）
- 阶段定义：`import_time`, `init_time`, `settings_time`, `total_time`
- `profileCheckpoint()`：分析禁用时零开销

---

## 7. API 错误恢复

### 7.1 指数退避 + Jitter

`withRetry.ts:530-545`：

```typescript
baseDelay = min(500 * 2^(attempt-1), maxDelayMs)
jitter = random() * 0.25 * baseDelay
return baseDelay + jitter
```

`Retry-After` 响应头存在时优先使用。

### 7.2 前台 vs 后台区分

529 过载时：
- 前台源（用户交互）→ 重试
- 后台源（summaries/titles/suggestions/classifiers）→ 立即退出（防止 3-10x 网关放大）

### 7.3 快速模式冷却

429/529 时：
- `Retry-After < 20s` → 等待并保持快速模式（保留 Prompt Cache）
- `Retry-After >= 20s` → 进入冷却（最短 10 分钟），切换到标准速度

### 7.4 持久重试模式

`CLAUDE_CODE_UNATTENDED_RETRY` 环境变量：
- 最大退避 5 分钟，重置上限 6 小时
- 429/529 无限重试
- 心跳分块保持 stdout 活跃

### 7.5 模型回退

连续 3 次 529 → `FallbackTriggeredError` → 切换到回退模型。非自定义 Opus 模型 或 所有主模型（`FALLBACK_FOR_ALL_PRIMARY_MODELS` 启用时）。

---

## 8. Prompt Cache 断点检测

### 8.1 两阶段架构

**Phase 1 — `recordPromptState()`**（`src/services/api/promptCacheBreakDetection.ts:247-428`）：
- API 调用前记录当前状态快照
- 计算多个哈希：System Hash、Tools Hash、CacheControl Hash、Per-Tool Hashes
- 追踪 11 个变更维度：system prompt、tools、model、fast mode、cache control、global cache strategy、betas、auto mode、overage、cached microcompact、effort
- 维度变化时构建 `pendingChanges` 对象（添加/移除的工具、变化的 schema 等）

**Phase 2 — `checkResponseForCacheBreak()`**（lines 435-665）：
- API 调用后比较 `cache_read_input_tokens`
- 判定条件：`cacheReadTokens < prevCacheRead * 0.95`（5%+ 下降）AND `tokenDrop >= 2,000`
- 分类根因为：客户端变化 / TTL 过期（1h 或 5min） / 服务端原因（Prompt 未变，< 5min 间隔 → ~90% 的未知断点）
- 日志 `tengu_prompt_cache_break` 事件 + 调试 diff 文件

### 8.2 状态管理

- 跟踪键上限：10 个（`MAX_TRACKED_SOURCES`，防止来自多个子代理的内存无限增长）
- Haiku 模型排除（缓存行为不同）
- 压缩后重置基线（`notifyCompaction()`）
- 代理终止时清理（`cleanupAgentTracking()`）
- 会话重置 / `/clear` 时全部清理
