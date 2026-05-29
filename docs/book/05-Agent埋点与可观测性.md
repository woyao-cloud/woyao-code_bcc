# 第五章：Agent 埋点与可观测性

在 AI Agent 系统中，埋点不是"锦上添花"，而是"生存必需品"。Agent 的决策过程是黑箱的，工具执行是异步并发的，API 调用是跨网络的——如果没有完善的埋点体系，当系统行为异常时，开发者完全无法定位问题。本章分析 Claude Code 的埋点与可观测性设计。

## 5.1 埋点分层架构

Claude Code 的埋点体系分为五个层次，从底层数据到上层分析：

```
┌──────────────────────────────────────────────────┐
│  第五层：分析与洞察                                │
│  Statsig / 自定义面板 / 评测报告                   │
├──────────────────────────────────────────────────┤
│  第四层：聚合事件                                  │
│  logEvent → 事件管道 → 分析平台                    │
├──────────────────────────────────────────────────┤
│  第三层：结构化日志                                │
│  logAPIQuery / logForkAgentQueryEvent             │
│  带结构化元数据的日志                              │
├──────────────────────────────────────────────────┤
│  第二层：归因追踪                                  │
│  QueryChainTracking / AttributedCounter           │
│  链式追踪 + 数值归因                              │
├──────────────────────────────────────────────────┤
│  第一层：原始数据                                  │
│  API 响应头（usage）/ Stream 事件 / Console 日志   │
└──────────────────────────────────────────────────┘
```

## 5.2 核心埋点事件

### logAPIQuery

`logAPIQuery` 是系统中最核心的埋点事件。它在每次 API 调用时触发，记录以下信息：

- **模型信息**：model name、temperature、thinking config
- **请求规格**：messages length、tools count、betas
- **上下文**：permission mode、query source、previous request ID
- **环境**：build age（分钟）、API provider
- **追踪标识**：queryChainId（用于关联同一逻辑链的多次 API 调用）

这些信息通过 `logEvent` 发送到分析平台，并最终汇总到 Statsig 面板。

### logForkAgentQueryEvent

当子 Agent 发起 API 调用时，使用 `logForkAgentQueryEvent` 记录。除了 `logAPIQuery` 的标准字段外，还增加：

- **forkLabel**：子 Agent 的名称或标识
- **querySource**：标记此调用来自子 Agent
- **durationMs**：子 Agent 的执行耗时
- **messageCount**：子 Agent 消耗的消息轮次
- **totalUsage**：子 Agent 的 token 消耗
- **queryTracking**：嵌套的 chainId 和 depth（子 Agent 的嵌套深度）

这个事件让系统能够将主 Agent 和子 Agent 的 API 调用关联起来，形成完整的调用树。

## 5.3 归因体系（Attribution）

归因是埋点中最具挑战性的部分——每一行代码变更、每一个工具调用，究竟应该归功于哪个 Agent？哪个 API 调用？

### AttributedCounter

`AttributedCounter` 是归因体系的核心数据结构。它是一个"带标签的计数器"，每个增量都带有 attribution 信息：

```typescript
class AttributedCounter {
  // 按 agent 归因的数值
  // 如：AgentTool 写了 100 行，Bash 执行删了 20 行
  byAgent: Map<string, number>
  // 按 query chain 归因的数值
  byChain: Map<string, number>
}
```

### 归因追踪的维度

系统从多个维度追踪归因：

- **Agent 身份**：主线程 agent / 子 agent A / 子 agent B
- **工具类型**：FileWrite（新增行）/ FileEdit（变更行）/ Bash（输出行）
- **会话归属**：同一个 agent 的不同 API 调用
- **链式关系**：主 → 子 → 子的嵌套层级

### 归因数据的用途

归因数据最终用于：
- **成本分摊**：每个 agent 消耗了多少 token
- **效率分析**：哪个 agent 类型产出代码最多
- **问题定位**：哪次工具调用导致了文件损坏
- **评测指标**：准确率、完成率的分模型/分角色统计

## 5.4 链式追踪（QueryChainTracking）

多 Agent 场景下，一次用户请求可能触发多次 API 调用，分属不同的 agent。链式追踪解决的是"如何把这些调用关联起来"的问题。

**Chain ID**

每个"逻辑链"分配一个全局唯一的 chainId。主 Agent 发起第一次 API 调用时生成，后续所有相关的 API 调用（包括子 Agent 的调用）都使用相同的 chainId。

**Depth**

`depth` 字段记录嵌套层级：
- 主 Agent 的深度为 0
- 直接子 Agent 的深度为 1
- 子 Agent 的子 Agent 深度为 2

这样系统可以在分析时构建出完整的"调用树"：

```
用户请求
  └─ 主 Agent (chainId: xxx, depth: 0)
       ├─ API 调用 #1 (工具执行)
       ├─ API 调用 #2 (工具执行)
       └─ AgentTool → 子 Agent (chainId: xxx, depth: 1)
            ├─ API 调用 #3 (文件搜索)
            └─ API 调用 #4 (文件写入)
```

## 5.5 事件管道与分发

`logEvent` 是事件管道的入口。设计上采用了"批量发送 + 异步写入"的模式：

```typescript
logEvent(eventName, metadata) {
  if (sink === null) {
    eventQueue.push({ eventName, metadata })
    return  // 队列积累，sink 就绪后批量发送
  }
  sink.logEvent(eventName, metadata)
}
```

**关键设计点：**

1. **异步非阻塞**：`logEvent` 调用不会阻塞主流程。事件先入队，后台线程负责发送。
2. **延迟初始化**：sink（Statsig）可能在启动时还未就绪，事件先入队，sink 就绪后批量发送。
3. **不丢事件**：队列机制确保事件不会被静默丢弃。
4. **安全过滤**：`AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS` 类型标记——所有发送到分析平台的元数据不能包含代码或文件路径，避免敏感信息泄露。

## 5.6 内部日志系统

除了事件管道，系统还有一套完整的内部日志系统：

**console.log 的劫持**

生产模式下，`console.log` 的输出被重定向到日志文件而非终端。终端界面由 Ink 渲染的 React 组件控制，原始的 print 输出会破坏 UI。

**debug.ts / log.ts**

这两个模块是所有日志的输出网关：
- `log.ts`：通用日志（info、warn、error），按级别分类
- `debug.ts`：调试日志，仅在 `--debug` 模式下输出

**Internal Logging（Ant-only）**

`internalLogging.ts` 提供 Ant（Anthropic 员工）使用的内部日志：
- `logPermissionContextForAnts`：记录权限上下文
- 仅在 `USER_TYPE=ant` 时生效
- 输出到单独的日志文件

## 5.7 与评测团队的对接

埋点设计不仅要满足自己的调试需求，还要**与评测团队对齐**。

**评测所需的数据**

评测团队需要的数据包括：

- **每轮对话的完整轨迹（trajectory）**：用户输入 → 模型输出 → 工具调用 → 工具结果
- **成功/失败标记**：每个工具调用是否成功
- **延迟指标**：首 token 延迟、总处理时间
- **Token 消耗**：精确的输入/输出 token 数
- **模型信号**：stop_reason、max_tokens 是否触发

**结构化输出**

为了满足评测需求，埋点需要以结构化的格式输出。部分数据通过 `--structured-io` 模式输出为 NDJSON 格式，每行是一个独立的事件记录。格式包括：

```json
{
  "type": "assistant_message"|"tool_use"|"tool_result"|"user_message",
  "timestamp": "ISO 8601",
  "content": { ... },
  "metadata": {
    "agent": "main"|"agent:<name>",
    "turn": 3,
    "chainId": "..."
  }
}
```

这种结构化日志既是评测团队的输入，也是复现调试的依据。

## 5.8 可观测性对调试的作用

埋点体系在调试中的价值体现在：

**（1）问题复现**

有了完整的轨迹日志，评测团队可以在离线环境中"回放" Agent 的决策过程，理解为什么模型在特定时刻做出了特定选择。

**（2）失败分析**

当工具执行失败时，埋点提供了完整的上下文：什么模型、什么参数、哪个工具、什么输入、什么异常。开发人员可以直接定位到错误代码。

**（3）性能瓶颈定位**

首 token 延迟高？埋点可以区分"网络延迟"和"预处理延迟"和"渲染延迟"。工具执行慢？埋点可以按工具分类统计执行时间。

**（4）回归检测**

通过对比不同版本的埋点数据，评测团队可以检测到性能回归（如某个更新导致首 token 延迟增加了 20%）。

## 5.9 设计权衡讨论

**（1）埋点的粒度 vs 性能**

埋点越细，定位问题越容易，但埋点本身也消耗 CPU 和内存。特别是 `logAPIQuery` 和归因计数，每次调用都有开销。

方案：关键路径（API 调用、工具执行）全量埋点，非关键路径（渲染、状态更新）抽样埋点。

**（2）结构化 vs 文本日志**

结构化日志便于机器解析和统计分析，但人类阅读性差。纯文本日志反之。

方案：两种并存——结构化日志送往分析平台（Statsig），纯文本日志写入本地文件（供开发者手动查阅）。

**（3）事件 vs 指标**

事件是"发生了什么"（如一次 API 调用），指标是"趋势如何"（如平均首 token 延迟）。两者互补但存储和查询方式不同。

方案：事件通过 `logEvent` 管道发送，指标通过 `AttributedCounter` 内部聚合，定期上报。

---

**本章小结**：Claude Code 的埋点体系覆盖从原始数据到分析洞察的全链路。核心事件（logAPIQuery）、归因体系（AttributedCounter）、链式追踪（QueryChainTracking）三位一体，为评测、调试和性能优化提供了数据基础。下一章将讨论 C 端体验关键指标的优化策略。
