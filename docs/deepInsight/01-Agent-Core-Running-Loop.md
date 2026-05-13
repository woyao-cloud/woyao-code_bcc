# Agent 核心运行循环：设计与实现

## 1. 整体架构概览

Agent 核心运行循环是 CLI 的"心脏"，采用经典的 **Agentic Loop** 模式——一个 `while(true)` 循环配合 `continue` 语句实现多次迭代，每次迭代完成"调用模型 → 解析响应 → 执行工具 → 收集结果 → 继续/终止"的完整周期。

```
while (true):
  1. 上下文管理（Snip → Microcompact → Context Collapse → Autocompact）
  2. System Prompt 组装（静态段 + 动态段 + Git 状态）
  3. 阻塞限制检查（防止超出上下文窗口）
  4. 预测性自动压缩（预估本轮增长量）
  5. 流式 API 调用（含模型回退重试）
  6. 响应处理：
     - 异常恢复（collapse → compact → error 三级）
     - 工具执行（并发/流式双路径）
     - 工具摘要生成（fire-and-forget）
     - 处理工具执行期间的中止信号
  7. 继续条件判断：
     - needsFollowUp（存在工具调用）
     - Stop Hook 注入了阻塞错误
     - Token 预算未用完
  8. 否则：返回终止原因（completed / aborted / error）
```

核心代码入口：
- `src/query.ts:392` — `queryLoop()` 主循环生成器
- `src/QueryEngine.ts:192-215` — `QueryEngine` 会话级编排器
- `src/services/api/claude.ts:1039` — `queryModel()` API 调用调度

---

## 2. 消息准备（Message Preparation）

### 2.1 消息类型体系

内部使用强类型 `Message` 联合类型（`src/types/message.ts`），涵盖：
- `UserMessage` — 用户输入
- `AssistantMessage` — 模型响应（含 tool_use 块）
- `SystemMessage` — 系统提示/边界标记
- `ProgressMessage` — 进度状态
- `AttachmentMessage` — 附件注入（Memory 文件、Skill 列表等）
- `TombstoneMessage` — 部分响应失效标记

### 2.2 消息规范化流程

在执行 API 调用前，`normalizeMessagesForAPI()`（`src/utils/messages.ts:2275`）对消息数组执行以下处理：

1. **剥离** `progress` 消息和非本地命令的 `system` 消息
2. **过滤** 虚拟消息（`isVirtual=true`，如 REPL 内部工具调用）
3. **合并** 连续用户消息（Bedrock 兼容性）
4. **剥离** 不可用工具的 `tool_reference` 块（已断开的 MCP 服务器）
5. **剥离** 曾经导致错误的文档/图片块（PDF 过大、图片过大）
6. **上浮** Attachment 消息以匹配工具结果
7. **删除** `toolUseResult` 原始负载（仅保留 UI 渲染数据，调用前清理防止内存无限增长）

### 2.3 API 格式转换

`userMessageToMessageParam()` 和 `assistantMessageToMessageParam()`（`src/services/api/claude.ts:582/628`）将内部 `Message` 转换为 Anthropic SDK `MessageParam`：
- `cache_control` 标记放在每条消息最后一个内容块上
- 剥离 Gemini provider 元数据
- 跳过 thinking/redacted_thinking 块的 cache_control

### 2.4 工具结果格式化

工具结果创建为 `tool_result` 内容块，通过 `tool_use_id` 和 `sourceToolAssistantUUID` 配对到原生的 `tool_use` 块。错误结果包含 `is_error: true` 并用 `<tool_use_error>` 标签包裹错误内容。

---

## 3. System Prompt 动态组装

### 3.1 三层上下文并行获取

System Prompt 由三个独立上下文源并行获取（`src/utils/queryContext.ts:61-72`）：

| 上下文源 | 来源函数 | 内容 |
|----------|----------|------|
| `defaultSystemPrompt` | `getSystemPrompt()` | 静态指令 + 动态段（工具指令、行为规则、环境信息等）|
| `userContext` | `getUserContext()` | CLAUDE.md 全层级内容、当前日期 |
| `systemContext` | `getSystemContext()` | Git 状态快照、Cache Breaker 注入 |

### 3.2 System Prompt 的分层结构

`getSystemPrompt()`（`src/constants/prompts.ts:408`）构建的 Prompt 分为：

**静态段**（跨会话可缓存）：
- 角色描述与能力说明
- 任务执行指令
- 工具使用指引
- 输出效率要求

**动态边界标记** — `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 将静态段与动态段分离，使动态变更仅影响 Prompt 后缀（保留全局缓存命中）。

**动态段**（通过 `systemPromptSection()` 注册器注入）：
- 会话引导、Memory Prompt（四类型记忆分类）
- 模型覆盖、环境信息、输出语言/风格
- MCP 指令、Scratchpad 说明
- Token 预算、Brief 模式

### 3.3 CLAUDE.md 注入策略

CLAUDE.md 内容不直接进入 System Prompt，而是通过 `prependUserContext()`（`src/utils/api.ts:443`）作为消息前缀注入：

- CLAUDE.md 内容 → `<project-instructions>` 标签 + `isMeta: true` → **高权重指令**
- 日期、环境信息 → `<system-reminder>` 标签 + `isMeta: true` → 低权重（"可能相关也可能不相关"）

### 3.4 关键设计决策

- **记忆化缓存**：`getUserContext()` 和 `getSystemContext()` 使用 `memoize` 实现会话级缓存
- **全局 Cache 边界**：`SYSTEM_PROMPT_DYNAMIC_BOUNDARY` 确保会话间的静态+动态部分不变时全局缓存命中
- **Beta Header 锁存**：动态 Header（AFK 模式/Fast 模式/Cache 编辑）会话级稳定，防止中途切换导致 ~50-70K Token 缓存失效

---

## 4. 流式 API 通信

### 4.1 Provider 路由

`queryModel()`（`src/services/api/claude.ts:1039`）在共享预处理后分发到对应 Provider：

```typescript
if (getAPIProvider() === 'openai') → queryModelOpenAI()
if (getAPIProvider() === 'gemini')  → queryModelGemini()
if (getAPIProvider() === 'grok')    → queryModelGrok()
// 默认：Anthropic first-party 流式路径
```

Provider 选择优先级：`modelType` 参数 > 环境变量 > 默认 `firstParty`。

### 4.2 Anthropic 流式管道

**原始流优化**：使用 `anthropic.beta.messages.create({ stream: true }).withResponse()` 获取原始 `Stream<BetaRawMessageStreamEvent>`，而非官方的 `BetaMessageStream`。后者在每个 `input_json_delta` 上执行 `O(n²)` 的部分 JSON 解析，原始流方式手动管理工具输入的累积，避免了这一开销。

**事件处理循环**（`claude.ts:2020`）：

| 事件类型 | 处理动作 |
|----------|----------|
| `message_start` | 捕获 partialMessage、TTFB 时间戳、初始 usage |
| `content_block_start` | 初始化内容块（tool_use / text / thinking 等）|
| `content_block_delta` | 增量累积：text → 数组 push（避免 O(n²) 拼接），input_json → 字符串累积 |
| `content_block_stop` | 合并 text deltas → 构建 AssistantMessage → 产出 |
| `message_delta` | 更新最终 usage 和 stop_reason（直接修改已产出消息保证转录正确性），计算成本 |
| `stream_event` | 每个原始事件产出供上层使用 |

### 4.3 流空闲看门狗

- 默认 90 秒流空闲超时（`STREAM_IDLE_TIMEOUT_MS`）
- 45 秒警告计时器（`STREAM_IDLE_WARNING_MS`）
- 30 秒停顿检测阈值（`STALL_THRESHOLD_MS`）
- 超时后自动中止流并触发非流式回退

### 4.4 非流式回退

任何流式错误（用户主动中止除外）均自动回退到非流式请求：
- 远程会话（CCR）超时 120 秒（容器空闲终止约 5 分钟）
- 本地会话超时 300 秒
- 可通过 `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK` 禁用
- 流创建返回 404 时同样触发回退（处理不支持流式的网关）

---

## 5. 工具并发调度

### 5.1 工具注册体系

工具通过 `Tool<Input, Output, Progress>` 接口定义（`src/Tool.ts:383`），`buildTool()` 填充安全默认值（fail-closed）：
- `isConcurrencySafe = false`（默认不并发）
- `isReadOnly = false`（默认可写）
- `isEnabled = true`

两层工具池组装（`src/tools.ts`）：
1. `getAllBaseTools()` — 全量工具列表（~50+ tools，feature-gate 控制条件加载）
2. `filterToolsByDenyRules()` — 按权限拒绝规则过滤
3. `assembleToolPool()` — 合并内置 + MCP 工具，排序保证 Prompt Cache 稳定性

### 5.2 延迟工具加载

当工具数超过阈值时启用 `SearchExtraTools`：延迟工具的 Schema 被排除在 API 工具数组之外。模型通过 `SearchExtraToolsTool`（TF-IDF 语义搜索）发现工具，然后通过 `ExecuteExtraTool` 调用。这保持了工具 JSON 的稳定性，跨轮保留 Prompt Cache。

### 5.3 双路径并发执行

通过 Statsig 开关 `tengu_streaming_tool_execution2` 选择：

**路径 A — Batch 模式**（`src/services/tools/toolOrchestration.ts:20`）：
- `partitionToolCalls()` 将工具调用拆分为若干批次
- 每批次为：单个非并发安全工具 OR 多个连续并发安全工具
- 并发批次用 `Promise.all()` 执行（最大并发数 10，可配置）
- 非并发批次串行执行

**路径 B — 流式模式**（`src/services/tools/StreamingToolExecutor.ts`）：
- 工具在 API 流式产出 `tool_use` 块时即开始执行
- 内部队列维护工具状态：`queued → executing → completed → yielded`
- 非并发工具作为队列屏障
- **兄弟错误级联**：Bash 错误时中止所有并发兄弟任务；Read/WebFetch 错误不级联
- 结果按插入顺序缓冲和产出

### 5.4 工具执行生命周期

`runToolUse()`（`src/services/tools/toolExecution.ts:366`）：
1. 按名称查找工具（主名/别名/弃用别名回退）
2. 工具不存在 → 产出 "No such tool available" 错误
3. 信号已中止 → 产出取消消息
4. 委托给 `checkPermissionsAndCallTool()`：
   - **Zod 校验**：`tool.inputSchema.safeParse()`；延迟工具校验失败时包含 Schema 提示
   - **工具特定校验**：`tool.validateInput()`（如定义）
   - **投机 Bash 分类**：提前启动以与 Hooks/权限并行
   - **权限检查**：`canUseTool()`（包裹 Hooks、规则、权限模式）
   - **工具调用**：`tool.call()` 执行
5. 结果映射：`tool.mapToolResultToToolResultBlockParam()` → API 块参数

---

## 6. 结果收集与异常兜底

### 6.1 分层防御体系

**第 1 层 — withRetry（`src/services/api/withRetry.ts:170`）**：
- 默认最多 10 次重试，指数退避（base 500ms, cap 32s, jitter 25%）
- 区分前台/后台 querySource：529 过载时后台源立即退出避免放大
- 处理：401（OAuth 刷新）、403（Token 吊销）、429（限流，订阅者感知）、529（过载，3 次连续后触发模型回退）、408（超时）、5xx
- 持久重试模式（`CLAUDE_CODE_UNATTENDED_RETRY`）：429/529 无限重试，30 秒心跳保持 stdout 活跃

**第 2 层 — 流式回退**：
- 任何流式错误 → 非流式重试
- 用户主动中止（`APIUserAbortError`）直接传播，不触发回退
- 孤立的部分 Assistant 消息在 UI 中被 tombstone

**第 3 层 — 模型回退**：
- `FallbackTriggeredError` → 切换到 `fallbackModel`
- 清除已累积的 assistant/tool 消息，创建全新执行器

**第 4 层 — 恢复重试（`src/query.ts:1337`）**：
- 流式完成但无工具调用时检测异常：
  - **Prompt-too-long 被截留**：Collapse drain → Reactive Compact → 报错 三级递进
  - **媒体尺寸错误**：跳过 Collapse（无法剥离图片）→ Reactive Compact → 报错
  - **Max Output Tokens**：升级 capped 8k → 64k → 注入 "pick up where you left off" 多轮恢复（最多 3 次）

**第 5 层 — Stop Hooks（`src/query/stopHooks.ts`）**：
- 完整响应无工具调用时评估 Stop Hook
- 阻塞错误 → 注入消息并继续循环
- API 错误时跳过 Stop Hook（防止错误→Hook 阻塞→重试→错误螺旋）

**第 6 层 — Token 预算续接**：
- 当轮输出 Token < 目标预算：注入续接提示继续
- 收益递减时提前终止：仍然记录完成事件

### 6.2 螺旋防止机制

- `hasAttemptedReactiveCompact` 单次守卫
- `MAX_OUTPUT_TOKENS_RECOVERY_LIMIT = 3` 限制
- API 错误时跳过 Stop Hook
- Auto-Compact 断路器（连续 3 次失败后停止）
- Reactive Compact 守卫在 Stop Hook 循环间保持（不重置）

---

## 7. 设计权衡总结

### 7.1 状态管理：可变跨迭代 vs 不可变快照

循环使用 `let state: State` 配合每次迭代顶部的解构。`continue` 站点写入 `state = { ... }`（9 处独立赋值）。不可变值（systemPrompt, userContext 等）从 params 中一次性解构。`QueryConfig` 在入口处快照环境/Statsig 值。这种设计为未来提取为纯 reducer 模式 `(state, event, config) → state` 留下空间。

### 7.2 Prompt Cache 保真为一级关注点

大量努力投入到缓存稳定性：
- 工具数组按确定性顺序排序
- 内置工具形成连续前缀（防止 MCP 工具插入破环）
- 动态 Beta Header 会话级锁存
- 延迟工具 Schema 排除在 API 数组之外
- `systemPromptSection()` vs `DANGEROUS_uncachedSystemPromptSection()` 区分缓存感知
- Fast 模式冷却最短 10 分钟，防止来回切换破环

### 7.3 依赖注入提高可测试性

`QueryDeps`（`src/query/deps.ts`）注入 `callModel`, `microcompact`, `autocompact`, `uuid`，测试可提供 fake 实现而无需模块导入 spy。设计刻意窄化（仅 4 个依赖项）以验证模式可行性。

### 7.4 Provider 抽象策略

不使用硬抽象层，Provider（OpenAI/Gemini/Grok/Bedrock）在共享预处理（消息规范化、工具过滤、媒体剥离）后于 `queryModel()` 直接分发。每个 Provider 获取规范化后的 `messagesForAPI` 和完整 `tools` 列表，内部自行转换。避免了 Provider 抽象层的开销，但意味着每个 Provider 需独立实现 Anthropic 兼容的工具使用语义。

### 7.5 工具接口设计

`Tool` 接口（`src/Tool.ts:383`）出奇的丰富 — 50+ 方法，包括渲染 Hook（`renderToolUseMessage`, `renderToolResultMessage`）、权限 Hook（`checkPermissions`, `validateInput`）和 UX Hook（`userFacingName`, `getActivityDescription`）。`buildTool()` 填充安全默认值，使工具定义简洁同时确保 fail-closed 语义。

### 7.6 长运行会话的内存管理

- `toolUseResult` 负载在 UI 渲染后删除
- 原始流资源释放（`cleanupStream()`）
- `contentReplacementState` 按消息预算管理聚合工具结果大小
- 每轮后清除 JSC Performance Buffer（marks/measures/resource timings）
- Langfuse Span 关闭与 GC 清理
