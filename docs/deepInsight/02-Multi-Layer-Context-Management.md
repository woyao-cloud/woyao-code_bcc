# 多层 Context 管理机制

## 1. 概述

在 C 端长对话场景中，Token 消耗呈线性增长，而模型上下文窗口有限。本系统实现了一套**五层压缩策略 + 八级截断优先级链**的多层 Context 管理机制，确保长对话中体验不降级。

---

## 2. Token 追踪与计量

### 2.1 核心计算函数

`tokenCountWithEstimation()`（`src/utils/tokens.ts:251-292`）是"检查阈值（自动压缩、会话记忆初始化等）时的规范函数"：

- 从最新消息**向后遍历**
- 定位最后一条携带 `usage` 数据的 Assistant 消息
- 处理并行工具调用：回退到**第一个兄弟消息**（相同 `message.id`），确保交错的 `tool_result` 也被计入
- 公式：`getTokenCountFromUsage(usage) + roughTokenCountEstimationForMessages(newMessages)`

### 2.2 Token 消耗组成

`getTokenCountFromUsage()`（`src/utils/tokens.ts:55-65`）：

```typescript
input_tokens + cache_creation_input_tokens +
cache_read_input_tokens + output_tokens
```

### 2.3 上下文窗口解析

`getContextWindowForModel()`（`src/utils/context.ts:56-103`）按优先级链确定有效窗口：

1. `CLAUDE_CODE_MAX_CONTEXT_TOKENS` 环境变量（内部用户）
2. 模型名中的 `[1m]` 后缀（显式 1M 选择加入）
3. 模型能力查找
4. Beta Header `CONTEXT_1M_BETA_HEADER`
5. GrowthBook 实验 `getSonnet1mExpTreatmentEnabled()`
6. 内部模型配置
7. 默认值：`200,000`

---

## 3. 五层压缩策略

### 3.1 Auto Compact（主动压缩）

**文件**：`src/services/compact/autoCompact.ts`

在上下文接近阈值时主动触发。核心配置：
- 缓冲区：13,000 ~ 50,000 Token（随窗口大小缩放）
- 断路器：连续 3 次失败后停止
- 预测性检查：`estimateMaxTurnGrowth()` 预估本轮增长

**触发条件**（`shouldAutoCompact()`）：
```
tokenCountWithEstimation(messages) - snipTokensFreed >= getAutoCompactThreshold(model)
```

递归保护：`session_memory`、`compact`、`marble_origami` querySource 抑制。`CONTEXT_COLLAPSE` 启用或 `REACTIVE_COMPACT` GB 标志打开时也抑制。

**压缩执行**（`compactConversation()`，`src/services/compact/compact.ts:411-792`）：
1. 执行 PreCompact Hooks
2. 构建压缩 Prompt（含自定义指令）
3. 流式调用模型生成对话摘要
4. **CC-1180 处理**：压缩请求本身遇到 prompt-too-long → 迭代丢弃最旧 API 轮次组（最多 3 次重试）
5. 存储压缩边界标记
6. 后压缩恢复关键文件状态（最多 5 文件，每文件 5K Token，总预算 50K）+ Skills 摘要（25K Token）

### 3.2 Session Memory Compact（优先尝试）

**文件**：`src/services/compact/sessionMemoryCompact.ts`

在标准压缩前优先尝试。智能裁剪 Session Memory 内容：
- 最小保留：10,000 Token
- 最大保留：40,000 Token
- 在 `autoCompactIfNeeded()` 中置于标准压缩之前

### 3.3 Snip Compact（用户导向）

**文件**：`src/services/compact/snipCompact.ts`

基于边界的消息移除机制：
- 找到最后一条 `snip_boundary` 系统消息
- 根据 `removedUuids` 集合过滤消息
- 使用保守估算：字符数 / 4 ≈ Token 数
- 提示阈值：对话到达 30 条消息时提示模型可进行 snipe

### 3.4 Micro Compact（API 层级）

**文件**：`src/services/compact/microCompact.ts`

两个子变体：

**基于时间的 Microcompact**：当距上一条 Assistant 消息的间隔超过阈值时触发。清空可压缩工具结果（Read/Bash/Grep/Glob/WebSearch/WebFetch/FileEdit/FileWrite）的内容，保留最近的 N 条（可配置）。

**基于缓存的 Microcompact**（`CACHED_MICROCOMPACT` 开关）：使用 Cache 编辑 API 移除工具结果，**不破坏已缓存的前缀**，也**不修改本地消息内容**。效率更高。

### 3.5 Reactive Compact（紧急回退）

**文件**：`src/services/compact/reactiveCompact.ts`

当 API 返回 `prompt_too_long` 时的轻量回退方案。整个模块受 feature-gate `REACTIVE_COMPACT` 控制。每轮最多尝试 1 次（`hasAttempted` 守卫）。

---

## 4. 压缩执行顺序

在 `query.ts:569-630` 中定义严格的执行顺序：

```
1. Snip          → 基于 UUID 移除整条消息
2. Microcompact  → 内容清空大型工具结果
3. Context Collapse → 读取时投影（CONTEXT_COLLAPSE gate）
4. Auto Compact  → 完整对话摘要化
```

---

## 5. CLAUDE.md 四级层级加载

### 5.1 加载顺序（优先级从低到高）

**文件**：`src/utils/claudemd.ts` 头部注释

```
1. Managed memory  (/etc/claude-code/CLAUDE.md)        — 全局企业策略
2. User memory     (~/.claude/CLAUDE.md)                — 用户私有全局
3. Project memory  (CLAUDE.md, .claude/CLAUDE.md,       — 签入代码库
                    .claude/rules/*.md)
4. Local memory    (CLAUDE.local.md)                    — 本地私有（gitignored）
5. Auto memory     (~/.claude/projects/<slug>/memory/)  — 自动持久化记忆
6. Team memory     (TEAMMEM feature gate)               — 共享团队上下文
```

### 5.2 目录遍历策略

`getMemoryFiles()`（`src/utils/claudemd.ts:789-934`）从当前目录**向上遍历到根目录**：
- 根目录文件先加载（低优先级）
- 越靠近当前目录的文件后加载（高优先级）
- 嵌套 Git Worktree 检测：跳过主仓库 Project 文件，避免重复加载

### 5.3 高级特性

**`@include` 指令**：Memory 文件可使用 `@include` 引用其他文件，支持路径解析（`@path`, `@./path`, `@~/path`），最大嵌套深度 5 层，防止循环引用。

**条件规则**：`.claude/rules/*.md` 文件可通过 frontmatter `paths:` 字段实现路径范围限定，仅当操作文件匹配 glob 模式时才加载。

**文件内容截断**：单个 Memory 文件内容上限为 40,000 字符（`src/utils/claudemd.ts` 中的 `MAX_FILE_CONTENT_LENGTH`）。

---

## 6. 上下文组装优先级

### 6.1 最终 Prompt 结构

```
┌─ SYSTEM PROMPT（可缓存前缀）─────┐
│ 1. 归属头 + CLI Sysprompt 前缀    │
│ 2. 基础 System Prompt            │
│ 3. System Context（Git 状态）     │
│ 4. Advisor 指令（如启用）         │
└──────────────────────────────────┘
┌─ MESSAGES（用户上下文前缀）───────┐
│ 5. <project-instructions>        │
│    → CLAUDE.md 所有层级           │
│    → 高权重：OVERRIDE 指令        │
│ 6. <system-reminder>             │
│    → currentDate 等              │
│    → 低权重："可能相关"            │
│ 7. 对话历史                       │
└──────────────────────────────────┘
┌─ POST-MODEL 附件 ───────────────┐
│ 8. 附件消息（Memory/Skills/MCP）  │
│ 9. Hook 结果                     │
└──────────────────────────────────┘
```

### 6.2 关键设计原则

- **CLAUDE.md 高权重注入**：放入 `<project-instructions>` 携带 "OVERRIDE" 声明，不属于 "may or may not be relevant" 范围
- **环境上下文低权重**：放入 `<system-reminder>` 仅作参考
- **压缩后消息顺序**：`[boundaryMarker, ...summaryMessages, ...messagesToKeep, ...attachments, ...hookResults]`

---

## 7. 文件历史快照

### 7.1 快照机制

**文件**：`src/utils/fileHistory.ts`

查询引擎在每次 API 调用前（`QueryEngine.ts:653-668`）拍摄文件历史快照。

**三阶段快照流程**：
1. **Phase 1**：捕获当前文件历史状态
2. **Phase 2**：异步 IO — 备份修改过的跟踪文件（使用 `copyFile` 提高效率，mtime 优化后按需比较内容）
3. **Phase 3**：提交新快照到状态，继承未修改文件的前一个快照备份

### 7.2 关键参数

- 快照环形缓冲：最多 20 个（`MAX_SNAPSHOTS = 20`）
- 备份路径：`~/.claude/file-history/{sessionId}/{sha256_16chars}@vN`
- 支持 `fileHistoryRewind()` 回退文件系统到历史快照

---

## 8. 八级截断优先级链

当上下文满时，按以下优先级依次尝试：

| 级别 | 策略 | 机制 |
|------|------|------|
| 1 | 工具结果预算 | 截断或持久化单个工具结果到磁盘 |
| 2 | Snip | 基于 UUID 移除最旧消息 |
| 3 | Microcompact | 基于时间或缓存清空旧工具结果 |
| 4 | AutoCompact | 完整对话摘要化（阈值触发） |
| 5 | ReactiveCompact | API 错误后的紧急摘要（一次性） |
| 6 | PTL Retry | 压缩请求自身的组级删除 |
| 7 | Output Token Recovery | 升级 max_tokens 上限（8k → 64k） |
| 8 | 阻塞限制 | 返回合成错误，保留 `/compact` 余量 |

### 8.1 阻塞限制（最后防线）

当 Auto-Compact 关闭且上下文 > 有效窗口 - 3,000 Token 时，返回合成 `prompt_too_long` 错误而不实际调用 API。这保留了手动 `/compact` 的空间（`MANUAL_COMPACT_BUFFER_TOKENS = 3,000`）。

### 8.2 PTL Retry

当压缩请求本身因上下文过大而失败时：
- 迭代丢弃最旧 API 轮次组（最多 3 次重试）
- 回退方案：丢弃 20% 的组
- 永不丢弃到低于 1 组

---

## 9. 上下文分析工具

`analyzeContext()`（`src/utils/contextAnalysis.ts:27-97`）提供 Token 预算的细粒度分类：
- 工具请求 vs 工具结果（按工具细分）
- 人类消息 vs Assistant 消息
- Attachments
- **重复文件读取检测**：检测同一文件的重复读取并计算浪费的 Token

这些指标通过 `tokenStatsToStatsigMetrics()` 转换为 Analytics-ready 的百分比指标，用于持续监控和优化。
