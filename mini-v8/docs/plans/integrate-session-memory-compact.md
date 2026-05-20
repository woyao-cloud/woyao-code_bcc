# 补齐 sessionMemory 持久化 + 完善压缩系统 — 实施计划

## 目标

集成会话记忆（sessionMemory）与对话压缩系统，让压缩不再依赖 LLM 生成摘要，而是直接从持久化的 session memory 文件中读取笔记，作为压缩后的上下文重建。

---

## 阶段 0：当前状态盘点

### mini-v8 已有的

| 模块 | 状态 |
|------|------|
| `sessionMemory.ts` | 有基础的笔记提取（正则提取用户请求/决策/文件路径）+ 文件持久化 |
| `autoCompact.ts compactMessages()` | 已接受可选的 `sessionMemorySummary` 参数 |
| `apiProjection.ts` | 已调用 `getSessionMemorySummaryForCompact()` |
| `context.ts` | 已在系统提示中注入 session memory（`buildBudgetedSessionMemoryBlock`) |
| `shouldInjectSessionMemoryIntoPrompt()` | 已实现 auto/never/always 模式 |

### mini-v8 缺失的

| 功能 | 主项目位置 | 复杂度 |
|------|-----------|--------|
| `lastSummarizedMessageId` 边界跟踪 | `sessionMemoryCompact.ts → sessionMemoryUtils.ts` | **中** |
| 会话记忆独立压缩路径（无需 LLM） | `sessionMemoryCompact.ts` | **高** |
| 精确的 `calculateMessagesToKeepIndex` | `sessionMemoryCompact.ts:326` | **高** |
| tool_use/tool_result 配对保护 + thinking 块合并 | `sessionMemoryCompact.ts:adjustIndexToPreserveAPIInvariants` | **中** |
| 压缩边界标记 + 后续边界识别 | autoCompact.ts + sessionMemoryCompact.ts | **中** |
| 并发提取防护（stale detection + timeout） | `sessionMemoryUtils.ts` | **低** |
| 节大小分析与截断 | `sessionMemory/prompts.ts:truncateSessionMemoryForCompact` | **低** |

---

## 阶段 1：边界跟踪基础设施

### 1.1 添加 `lastSummarizedMessageId`

**文件**: `src/services/memory/sessionMemory.ts`

添加模块级状态：
- `lastSummarizedMessageId: string | undefined` — 跟踪上次被总结的消息 ID
- `getLastSummarizedMessageId()` — getter
- `setLastSummarizedMessageId(id)` — setter
- `resetSummarizedMessageId()` — 重置（测试/会话结束时调用）

**序列化到磁盘**: 在 session memory markdown 文件的元数据区存入 `lastSummarizedMessageId`，在 `readSessionMemory()` 时恢复。

在 `persistSessionMemoryWithTokenCount()` 中添加元数据写入：
```
# Session Memory
Session: <id>
LastSummarizedMessageId: <uuid>
```

在 `parseSessionMemoryMarkdown()` 中解析元数据并返回。

### 1.2 添加并发提取防护

**文件**: `src/services/memory/sessionMemory.ts`

添加：
- `extractionStartedAt: number | undefined`
- `markExtractionStarted()` / `markExtractionCompleted()`
- `waitForSessionMemoryExtraction(timeoutMs = 15000)` — 轮询等待，stale detection（1 分钟）

### 1.3 添加节截断函数

**文件**: `src/services/memory/sessionMemory.ts`

添加：
- `truncateSessionMemoryForCompact(content: string, maxTokens?: number)` — 按段截断，每段 2000 token 限制，总共 12000 token 限制
- `isSessionMemoryEmpty(content: string)` — 检查文件是否只有模板没有实际内容

---

## 阶段 2：会话记忆独立压缩路径

### 2.1 创建 `sessionMemoryCompact.ts`

**新文件**: `src/services/compact/sessionMemoryCompact.ts`

核心功能：
1. `calculateMessagesToKeepIndex(messages, lastSummarizedIndex)` — 从上次总结点开始，向后扩展到满足：
   - 最少 token 数（默认 10000）
   - 最少 text-block 消息数（默认 5）
   - 硬上限（默认 40000）
2. `adjustIndexToPreserveAPIInvariants(messages, startIndex)` — 确保：
   - tool_use/tool_result 配对不被切断
   - 共享相同 message.id 的 thinking block 被一起保留
3. `trySessionMemoryCompaction(messages)` — 主入口：
   - 检查是否有 session memory 内容
   - 根据 lastSummarizedMessageId 计算保留点
   - 读取 session memory 内容，截断，构建 CompactionResult
   - 返回 compacted messages
4. `getSessionMemoryCompactConfig()` / `setSessionMemoryCompactConfig()` — 配置管理

**输出格式**: 使用 `getCompactUserSummaryMessage()` 包装 session memory 内容，生成与 LLM 压缩兼容的消息格式。

### 2.2 集成到 `autoCompact.ts`

修改 `compactMessages()`：
- 添加 `sessionMemoryCompactEnabled?: boolean` 选项
- 当启用且 `sessionMemorySummary` 提供时，直接使用 session memory 替代 `generateCompactionSummary()`
- 添加 `SESSION_MEMORY_COMPACTION_MARKER` 标记

修改 `needsCompaction()`：
- 暴露 `getCompactBuffer()` 让外部可以访问阈值（当前是 module-private）

### 2.3 集成到 `apiProjection.ts`

修改 `projectMessagesForAPI()`：
- 在语义压缩阶段，优先尝试 `trySessionMemoryCompaction()`
- 如果 session memory 压缩成功，跳过 LLM 压缩
- 如果失败，回退到原有的 `compactMessages()`

---

## 阶段 3：压缩边界持久化

### 3.1 压缩边界元数据

**文件**: `src/services/compact/sessionMemoryCompact.ts`

- 在 `CompactBoundaryMetadata` 中添加 `lastSummarizedMessageId` 字段
- 压缩后记录边界，以便后续压缩知道从哪里开始

### 3.2 边界恢复

**文件**: `src/services/messages/apiProjection.ts`

- 恢复会话时，从最后一个 `CompactBoundaryMetadata` 中读取 `lastSummarizedMessageId`
- 调用 `setLastSummarizedMessageId()` 恢复状态

---

## 阶段 4：配置与集成

### 4.1 配置整合

- 通过 `SessionMemoryConfig` 控制 session memory compaction 的开关：
  - `sessionMemoryCompactEnabled: boolean`（默认 true）
- 阈值配置：
  - `minTokens: number`（默认 10000）
  - `minTextBlockMessages: number`（默认 5）
  - `maxTokens: number`（默认 40000）

### 4.2 集成到 `reactiveCompact.ts`

- 在反应式压缩的每一步也优先尝试 session memory 压缩
- 失败后再回退到消息丢弃

---

## 阶段 5：测试

### 5.1 单元测试

**新文件**: `src/services/compact/__tests__/sessionMemoryCompact.test.ts`

测试用例：
1. `calculateMessagesToKeepIndex` — 基本功能、边界条件、最小 token 保证
2. `adjustIndexToPreserveAPIInvariants` — tool_use/tool_result 配对、thinking 块合并
3. `trySessionMemoryCompaction` — 完整压缩路径、空内容回退、错误处理
4. `lastSummarizedMessageId` — 序列化/反序列化、跨会话恢复

### 5.2 集成测试

**修改**: `src/__tests__/context.test.ts`

- 测试 session memory 注入 + 压缩后的上下文重建

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| **修改** | `src/services/memory/sessionMemory.ts` | 添加边界跟踪、并发防护、截断函数 |
| **新建** | `src/services/compact/sessionMemoryCompact.ts` | 独立压缩路径实现 |
| **修改** | `src/services/compact/autoCompact.ts` | 集成 session memory 压缩选项 |
| **修改** | `src/services/messages/apiProjection.ts` | 优先尝试 session memory 压缩 |
| **修改** | `src/services/compact/reactiveCompact.ts` | 反应式压缩中集成 SM |
| **修改** | `src/services/compact/prompt.ts` | 添加 compaction 摘要格式支持 |
| **新建** | `src/services/compact/__tests__/sessionMemoryCompact.test.ts` | 单元测试 |

---

## 依赖关系

```
阶段 1 (边界跟踪)
    ↓
阶段 2 (独立压缩路径)
    ↓
阶段 3 (边界持久化)
    ↓
阶段 4 (集成配置)
    ↓
阶段 5 (测试)
```

阶段 1 是前置依赖，阶段 2-3 可部分并行，阶段 4-5 需要前面全部完成。

---

## 关键设计决策

1. **不引入 LLM 驱动提取** — mini-v8 继续使用正则提取，保持低成本
2. **不引入 GrowthBook 远程配置** — 使用静态配置 + 环境变量覆盖
3. **Session memory 替代而非补充** — 当 session memory 有内容时，完全替代 LLM 摘要；当空时回退到现有压缩
4. **向后兼容** — 所有修改都通过配置开关控制，默认开启但可关闭
