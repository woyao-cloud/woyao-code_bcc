# 第三章：多层 Context 管理机制

长对话是 C 端 AI 产品最大的技术挑战之一。当对话持续数小时、经历几十轮工具调用、产生数千行代码变更时，如何确保模型不"忘记"关键上下文、不因 token 超限而崩溃、不让缓存降级影响响应速度？本章深入 Claude Code 的多层 Context 管理体系。

## 3.1 长对话的挑战

长对话面临三个根本问题：

**（1）Token 预算天花板**

每个模型都有固定的 context window（如 Claude 的 200K tokens）。当对话内容超过这个上限，API 会直接拒绝请求。随着对话推进，历史消息、工具结果、文件内容不断累积，token 占用只增不减。

**（2）Prompt Cache 降级**

Anthropic API 提供 Prompt Caching 功能——系统 prompt + 早期消息可以缓存，后续请求只需传输增量内容（节省延迟和成本）。但缓存有 5 分钟 TTL，如果两次 API 调用间隔过长，缓存过期，后续请求重新传输全部内容。cache hit rate 直接影响响应速度和账单。

**（3）模型注意力稀释**

即使是 200K context，模型的注意力也不是均匀分布的——中间段的信息容易被遗忘（"lost in the middle"效应）。消息越多，关键信息的"信噪比"越低。

## 3.2 三层上下文体系

Claude Code 将上下文分为三个层次，每层有不同的生命周期和管理策略：

```
┌─────────────────────────────────────────────────┐
│  第一层：System Prompt（每轮组装，不被压缩）      │
│  - 角色定义 / 项目环境 / CLAUDE.md / Memory      │
│  - 工具列表 / 系统指令                            │
│  - 策略：永远保持最新，放在最前（被缓存）          │
├─────────────────────────────────────────────────┤
│  第二层：活跃消息（完整保留）                      │
│  - 最近 N 轮对话（N ≈ keepPairs 配置）            │
│  - 策略：完整无损，放在缓存前缀中                  │
├─────────────────────────────────────────────────┤
│  第三层：压缩历史（摘要替代）                      │
│  - 早期的对话和工具调用                            │
│  - 策略：LLM 压缩为摘要，放缓存在缓存前缀之前       │
└─────────────────────────────────────────────────┘
```

## 3.3 Compaction（压缩）机制

Compaction 是 Context 管理的核心机制。它用一个 LLM 生成的摘要替换一段早期对话历史。

**触发时机**

Compaction 可以在三种场景下触发：

1. **自动 Compaction**：当消息数接近阈值时，在 API 调用前自动触发。由 `isAutoCompact` 标志控制。
2. **手动 Compaction**：用户通过 `/compact` 命令手动触发。可以指定自定义指令来影响压缩方式。
3. **重压缩（Recompaction）**：当已压缩的消息再次接近 token 上限时，对之前压缩的摘要再次压缩。

**Compaction 流程**

```
[Pre-Compact Hooks] → [LLM 摘要压缩] → [Post-Compact Cleanup]

第一阶段：Pre-Compact Hooks
  - 执行用户配置的 pre_compact hooks（如注入额外指令）
  - 收集 hook 返回的自定义指令和用户展示消息
  - 允许用户影响"应该保留什么重点"

第二阶段：LLM 摘要压缩
  - 将要压缩的消息段发送给 LLM（通常用 Haiku）
  - 生成结构化的摘要：目标任务、已完成的步骤、当前状态、重要决策
  - 摘要格式化为 UserMessage 放入消息列表

第三阶段：Post-Compact Cleanup
  - 替换旧消息为压缩边界标记（CompactBoundaryMessage）
  - 更新 token 计数
  - 重建缓存前缀
```

**CompactionResult**

压缩完成后返回一个 `CompactionResult`，包含：

- `boundaryMarker`：标记压缩边界的 SystemMessage（对用户可见，用来说明"之前的对话已压缩"）
- `summaryMessages`：LLM 生成的摘要内容（UserMessage 格式）
- `attachments`：压缩过程中保留的附件引用
- `hookResults`：hook 执行的副作用结果
- `preCompactTokenCount` / `postCompactTokenCount`：压缩前后的 token 数
- `compactionUsage`：压缩过程本身的 token 消耗

**压缩了什么**

压缩时删除的内容包括：
- 早期的工具调用和结果（"写文件 → 文件已保存"这类已完成的交互）
- 早期的代码片段和 diff
- 已过时的讨论和决策路径
- 重复的上下文信息

**压缩保留了什么**

- 任务的核心目标和当前进度
- 已做出的关键决策和原因
- 文件结构和关键代码位置
- 用户偏好的体现

## 3.4 Token 预算管理

除了 Compaction，系统还会持续监控 token 预算：

**tokenCountWithEstimation**

这个函数使用混合策略计算当前消息列表的 token 数：
- 最近的 API 响应有精确的 usage 数据（从 model response 的 headers 中提取）
- 远端的消息用"粗略估算"（字符数 × 系数）
- 从最近的精确数据点向后推算，确保估算尽可能准确

**缓存感知**

系统会追踪每次 API 调用的缓存状态：
- `cache_creation_input_tokens`：首次写入缓存的 token 数
- `cache_read_input_tokens`：从缓存读取的 token 数
- 监控 cache hit rate，在命中率低时调整策略

**Token Budget**

当 token 用量接近模型上限时，系统会：
1. 在 UI 中显示警告（黄色进度条）
2. 在超过阈值时自动触发 Compaction
3. 在极端情况下（即使压缩后仍超限）限制工具执行

## 3.5 Prompt Cache 策略

Prompt Cache 是 Anthropic API 的优化功能，Claude Code 对其有深度利用：

**缓存前缀构建**

API 请求中的 system prompt + 早期 messages 构成"缓存前缀"。构建原则：
- 所有工具定义放在 system prompt 中
- 压缩后的摘要放在缓存前缀之前
- 最近的 N 轮对话放在缓存前缀中
- 只有变化的尾部内容（最新消息）突破缓存

**Cache Break 检测**

系统会检测哪些操作会导致缓存失效（cache break）：
- 消息列表长度变化
- system prompt 内容变化（如 git 状态更新）
- 工具列表变化（如 MCP 连接了新服务器）

当检测到 cache break 时，系统会评估是立即重建缓存更划算，还是接受一次"cold start"。

**5 分钟 TTL 的应对**

由于缓存只有 5 分钟 TTL：
- 连续的工具调用在同一轮循环中，间隔短，缓存通常是 hot 的
- 用户思考/打字的时间间隔如果超过 5 分钟，下一次请求的缓存会 cold
- 系统会尽量在一次 Agent 循环中完成尽可能多的工作，减少跨间隔的请求

## 3.6 Context Collapse（实验性）

`CONTEXT_COLLAPSE` 是一个 feature-gated 的实验性功能。与 Compaction 不同，它不替换消息，而是**折叠**历史对话 span：

- 将消息序列分"span"
- 对每个 span 生成结构化摘要
- 折叠后的 span 在 API 请求中被替换为摘要
- 原始消息保留在本地存储中（可展开查看）

这种方式比 Compaction 更灵活——如果用户需要回顾历史，可以展开查看原始内容。但它需要更复杂的状态管理，且 feature 目前是禁用的。

## 3.7 边界情形与降级策略

**（1）消息列表为空**

没有任何消息时发起 Compaction 会直接抛出错误——这是有意的设计，避免无效操作。

**（2）压缩后仍超限**

这是最棘手的场景。策略是：
1. 先尝试增加压缩力度（保留更少的 keepPairs）
2. 如果仍不行，尝试移除一些附件（图片、大文件）
3. 最后限制消息中的代码片段大小

**（3）用户主动干预**

用户可以通过 `/compact` 命令手动触发压缩，并传入自定义指令。这在用户觉得"AI 好像忘记了我之前说的重要事项"时特别有用。

**（4）多轮对话中的 Cache 优化**

每次 API 调用的 `previous_request_id` 被记录并传递。这样 API 层可以在服务端进行请求关联，优化缓存策略。

## 3.8 设计权衡讨论

**（1）自动 vs 手动压缩**

自动压缩让用户体验更流畅（不用思考"我的上下文快满了吗"），但可能在用户不希望丢失上下文时触发。

Claude Code 的方案：默认自动压缩，但提供 `/compact` 命令和 `customInstructions` 参数让用户干预。自动压缩的触发阈值可配置。

**（2）压缩精度 vs 成本**

用 LLM 压缩比简单截断更精确（保留语义要点），但每次压缩都消耗额外的 API 调用和 token。

方案：使用小模型（Haiku，而非主力模型）做压缩，控制成本。同时，压缩是"用一次 API 调用避免后续多次 cold start"——在长对话中通常是划算的。

**（3）消息保留深度**

`keepPairs` 参数控制压缩后保留多少轮最近的对话。值越大，模型看到的信息越多（更好理解上下文），但 token 消耗也越大。

方案：默认保留 3 轮对话，可配置。核心思路是"最近 3 轮 + 压缩摘要"——兼顾细节和全局。

---

**本章小结**：多层 Context 管理是 Claude Code 支撑长对话的核心技术。通过 Compaction、Token Budget 管理、Prompt Cache 策略和实验性的 Context Collapse，系统在 token 预算内最大化信息密度，保障 C 端用户的长对话体验不降级。下一章将探讨 Memory 体系——让 AI 在会话间"记住"用户的偏好和关键信息。
