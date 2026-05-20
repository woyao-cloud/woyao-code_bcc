

> 展开Phase 2 优化细节                                                          

● 让我先研究主代码库中 Phase 2 三个特性的具体实现。

● 3 Explore agents finished (ctrl+o to expand)
   ├ Research snip compact implementation · 24 tool uses · 38.2k tokens
   │ ⎿  Done
   ├ Research cached microcompact · 29 tool uses · 46.1k tokens
   │ ⎿  Done
   └ Research post-compact cleanup · 29 tool uses · 43.8k tokens
     ⎿  Done

● Phase 2 实现细节

  基于对主代码库的完整分析，以下是三个特性的实现细节。

  ---
  2-4 Snip Compact（历史裁剪）

  核心思路: 注入 snip_boundary 系统消息，记录所有现有消息的 UUID，后续 API
  调用前从消息数组中物理移除已标记的消息。

  关键前提: mini-v8 当前消息类型 BetaMessageParam[] 不包含 uuid
  字段。需要先扩展消息类型。

  改动 A — 扩展消息类型

  在 apiProjection.ts 或新建 types/snip.ts 中定义带 UUID 的消息系统：

  // mini-v8/src/services/compact/snipCompact.ts (新建)

  export interface SnipMessage {
    role: 'user' | 'assistant' | 'system'
    content: string | Array<Record<string, unknown>>
    uuid?: string
    subtype?: string              // 'snip_boundary' | 'snip_marker'
    snipMetadata?: {
      removedUuids?: string[]
    }
    isMeta?: boolean
    timestamp?: string
  }

  // mini-v8 的 BetaMessageParam 没有 uuid，需要在外层包装
  // 方案：在 conversation buffers 中维护 uuid map

  改动 B — Snip 核心逻辑

  // mini-v8/src/services/compact/snipCompact.ts

  const SNIP_NUDGE_THRESHOLD = 30

  export const SNIP_NUDGE_TEXT =
    'The conversation history is getting long. Consider using /force-snip to 
  compress older messages.'

  /**
   * 检查消息是否为 snip boundary 标记
   */
  export function isSnipBoundaryMessage(msg: SnipMessage): boolean {
    return msg.role === 'system' && msg.subtype === 'snip_boundary'
  }

  /**
   * 扫描最后一个 snip_boundary，过滤掉其 removedUuids 中的消息
   */
  export function snipCompactIfNeeded(
    messages: SnipMessage[],
  ): { messages: SnipMessage[]; executed: boolean; tokensFreed: number } {
    // 1. 从末尾向前扫描最后一个 snip_boundary
    let boundaryIdx = -1
    let removedUuids: string[] | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      if (isSnipBoundaryMessage(messages[i])) {
        boundaryIdx = i
        removedUuids = messages[i].snipMetadata?.removedUuids
        break
      }
    }

    if (boundaryIdx === -1) {
      return { messages, executed: false, tokensFreed: 0 }
    }

    // 2. 无 removedUuids → 从 boundary 后全部保留
    if (!removedUuids || removedUuids.length === 0) {
      return {
        messages: messages.slice(boundaryIdx),
        executed: true,
        tokensFreed: 0,
      }
    }

    // 3. 过滤掉 removedUuids 中的消息（保留 boundary 本身）
    const removedSet = new Set(removedUuids)
    let tokensFreed = 0
    const kept = messages.filter(msg => {
      if (msg.uuid && removedSet.has(msg.uuid)) {
        tokensFreed += estimateMessageTokens(msg)
        return false
      }
      return true
    })

    return { messages: kept, executed: true, tokensFreed }
  }

  function estimateMessageTokens(msg: SnipMessage): number {
    if (typeof msg.content === 'string') {
      return Math.max(1, Math.ceil(msg.content.length / 4))
    }
    if (Array.isArray(msg.content)) {
      let chars = 0
      for (const block of msg.content) {
        if (typeof block === 'string') {
          chars += block.length
        } else if (block && typeof block === 'object') {
          chars += JSON.stringify(block).length
        }
      }
      return Math.max(1, Math.ceil(chars / 4))
    }
    return 1
  }

  /**
   * 创建 snip_boundary 消息
   */
  export function createSnipBoundaryMessage(
    allUuids: string[],
  ): SnipMessage {
    return {
      role: 'system',
      subtype: 'snip_boundary',
      content: '[snip] Conversation history before this point has been 
  snipped.',
      uuid: 'snip-' + randomUUID().slice(0, 8),
      isMeta: true,
      timestamp: new Date().toISOString(),
      snipMetadata: {
        removedUuids: allUuids,
      },
    }
  }

  export function shouldNudgeForSnips(messageCount: number): boolean {
    return messageCount >= SNIP_NUDGE_THRESHOLD
  }

  改动 C — 在 ConversationBuffers 中添加 UUID 追踪

  在 apiProjection.ts 的 ConversationBuffers 中维护消息 UUID 索引：

  export interface ConversationBuffers {
    fullMessages: BetaMessageParam[]
    messageUuids: string[]                       // ← 新增：与 fullMessages 
  一一对应的 UUID
    forceCompactNextProjection: boolean
    toolResultBudgetState: ToolResultBudgetState
    compactBoundaries: CompactBoundaryMetadata[]
  }

  每次 push 消息时自动生成 UUID：

  export function pushMessage(
    buffers: ConversationBuffers,
    msg: BetaMessageParam,
  ): string {
    const uuid = randomUUID()
    buffers.fullMessages.push(msg)
    buffers.messageUuids.push(uuid)
    return uuid
  }

  改动 D — 在 query.ts 中应用 Snip

  在 query.ts 的 projectMessagesForAPI 之后添加 snip 过滤：

  // query.ts, 在 toolsMap 和 turnLimitManager 初始化之后：

  // 将 messages+uuids 转换为 SnipMessage[]
  function toSnipMessages(
    msgs: BetaMessageParam[],
    uuids: string[],
  ): SnipMessage[] { ... }

  // 在每次 query loop 中，projectMessagesForAPI 之后：
  const snipResult =
  snipCompactIfNeeded(toSnipMessages(conversation.fullMessages,
  conversation.messageUuids))
  if (snipResult.executed) {
    // 用 snip 后的消息替换 fullMessages
    messagesForAPI = snipResult.messages  // ...apply to API projection
  }

  改动 E — /force-snip 命令（可选）

  // mini-v8/src/commands/force-snip.ts
  export function executeForceSnip(
    buffers: ConversationBuffers,
  ): CommandResult {
    const allUuids = [...buffers.messageUuids]
    const boundary = createSnipBoundaryMessage(allUuids)
    buffers.fullMessages.push(boundary as unknown as BetaMessageParam)
    buffers.messageUuids.push(boundary.uuid!)
    return { success: true, message: `Snipped ${allUuids.length} messages` }
  }

  复杂度: 中。核心逻辑简单（~100 行），但需要修改消息类型系统和
  ConversationBuffers。

  ---
  2-5 Cached Microcompact

  核心思路: 利用 Anthropic 4.x 的 cache_edits API，在服务端删除旧 tool result
  而不修改本地消息，保留 prompt cache。

  改动 A — 状态机核心

  // mini-v8/src/services/compact/cachedMicrocompact.ts (新建)

  const TRIGGER_THRESHOLD = 10
  const KEEP_RECENT = 5

  interface CachedMCState {
    registeredTools: Set<string>       // 所有已注册的 tool_use_id
    toolOrder: string[]                 // 插入顺序（FIFO 淘汰）
    deletedRefs: Set<string>           // 已删除的 tool_use_id
    toolsSentToAPI: boolean
  }

  interface CacheEditsBlock {
    type: 'cache_edits'
    edits: Array<{ type: 'delete'; cache_reference: string }>
  }

  export function createCachedMCState(): CachedMCState {
    return {
      registeredTools: new Set(),
      toolOrder: [],
      deletedRefs: new Set(),
      toolsSentToAPI: false,
    }
  }

  export function registerToolResult(state: CachedMCState, toolId: string): void
   {
    if (!state.registeredTools.has(toolId)) {
      state.registeredTools.add(toolId)
      state.toolOrder.push(toolId)
    }
  }

  /**
   * FIFO 淘汰：当活跃工具数 > TRIGGER_THRESHOLD，
   * 返回最旧的 (active - keepRecent) 个工具 ID
   */
  export function getToolResultsToDelete(state: CachedMCState): string[] {
    const active = state.toolOrder.filter(id => !state.deletedRefs.has(id))
    if (active.length <= TRIGGER_THRESHOLD) return []

    const toDelete = active.slice(0, active.length - KEEP_RECENT)
    for (const id of toDelete) {
      state.deletedRefs.add(id)
    }
    return toDelete
  }

  export function createCacheEditsBlock(toolIds: string[]): CacheEditsBlock |
  null {
    if (toolIds.length === 0) return null
    return {
      type: 'cache_edits',
      edits: toolIds.map(id => ({
        type: 'delete' as const,
        cache_reference: id,
      })),
    }
  }

  export function resetCachedMCState(state: CachedMCState): void {
    state.registeredTools.clear()
    state.toolOrder.length = 0
    state.deletedRefs.clear()
    state.toolsSentToAPI = false
  }

  改动 B — 集成到 query.ts 的 API 调用流程

  在 query.ts 中，需要：

  1. 从 assistant 消息中收集 tool_use_id（在 stream 完成后）
  2. 注册到 cachedMC 状态机（在 tool results 返回后）
  3. 在 API 调用前查询待删除的工具，构建 cache_edits 块

  // query.ts 中，在 query loop 内新增 cachedMC 集成

  // 模块级状态
  let cachedMCState: CachedMCState | null = null

  function getOrInitCachedMC(): CachedMCState {
    if (!cachedMCState) cachedMCState = createCachedMCState()
    return cachedMCState
  }

  // 在 stream 完成后，注册 assistant 消息中的 tool_use：
  function registerAssistantToolUses(
    toolUses: Array<{ id: string; name: string }>,
  ): void {
    const compactableTools = new Set(['Bash', 'Read', 'Write', 'Edit', 'Grep',
  'Glob', 'WebFetch', 'WebSearch'])
    for (const tu of toolUses) {
      if (compactableTools.has(tu.name)) {
        registerToolResult(getOrInitCachedMC(), tu.id)
      }
    }
  }

  // 在 API 调用前（streamClaudeAPI 的参数构建中）：
  function buildCacheEditsForRequest(): CacheEditsBlock | null {
    const state = cachedMCState
    if (!state || !state.toolsSentToAPI) {
      if (state) state.toolsSentToAPI = true
      return null  // 首次调用不需要 cache_edits
    }
    const toDelete = getToolResultsToDelete(state)
    return createCacheEditsBlock(toDelete)
  }

  改动 C — 修改 API client 支持 cache_edits

  mini-v8/src/services/api/claude.ts 中的 streamClaudeAPI 函数需要：

  1. 接受 cacheEdits?: CacheEditsBlock 参数
  2. 将 cache_edits 块插入到最后一个 user message 的 content 数组中
  3. 在 tool_result 块上设置 cache_reference

  // 修改 streamClaudeAPI 签名：
  export async function streamClaudeAPI(params: {
    messages: BetaMessageParam[]
    systemPrompt: string
    tools: Tool[]
    model: string
    maxTokens: number
    cacheEdits?: CacheEditsBlock   // ← 新增
  }): Promise<AsyncIterable<BetaRawMessageStreamEvent>>

  // 在构建 API 请求体时：
  function insertCacheEdits(
    messages: BetaMessageParam[],
    edits: CacheEditsBlock,
  ): BetaMessageParam[] {
    // 找到最后一个 user message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && Array.isArray(messages[i].content)) {
        // 将 cache_edits 块追加到 content 末尾
        messages[i].content.push(edits as unknown as Record<string, unknown>)
        break
      }
    }
    return messages
  }

  重要: Anthropic 4.x 的 cache_edits 需要 beta header：
  anthropic-beta: cache-editing-2025-02-19

  需要在 streamClaudeAPI 中添加此 header。

  复杂度: 高。需要 API 层支持、Beta header
  管理、状态机集成。但纯逻辑层（状态机）仅 ~80 行。

  ---
  2-6 Post-Compact Cleanup

  核心思路: 紧缩后清理各种模块级缓存和状态，确保下次操作不沿用过期数据。

  mini-v8 需要清理的状态：

  ┌─────┬───────────┬─────────────────────────────────┬─────────────────────┐
  │  #  │ 清理目标  │              来源               │       必要性        │
  ├─────┼───────────┼─────────────────────────────────┼─────────────────────┤
  │ 1   │ CachedMC  │ cachedMicrocompact.ts           │ 高 — 清除过期 tool  │
  │     │ state     │                                 │ ID                  │
  ├─────┼───────────┼─────────────────────────────────┼─────────────────────┤
  │ 2   │ Context   │ context.ts/contextCacheState.ts │ 高 —                │
  │     │ 缓存      │                                 │ 清除过期系统上下文  │
  ├─────┼───────────┼─────────────────────────────────┼─────────────────────┤
  │ 3   │ Session   │ sessionStore.ts                 │ 中 —                │
  │     │ 消息缓存  │                                 │ 避免序列化过期消息  │
  ├─────┼───────────┼─────────────────────────────────┼─────────────────────┤
  │     │ 系统      │                                 │                     │
  │ 4   │ prompt    │ 无（mini-v8 无此模块）          │ 跳过                │
  │     │ 部分      │                                 │                     │
  └─────┴───────────┴─────────────────────────────────┴─────────────────────┘

  // mini-v8/src/services/compact/postCompactCleanup.ts (新建)

  import { invalidateSystemContextCache } from '../context/contextCacheState.js'
  import { resetCachedMCState } from './cachedMicrocompact.js'

  /**
   * 紧缩后清理：清除缓存的上下文状态、工具跟踪状态等。
   * 应在每次 autoCompact / reactiveCompact 完成后调用。
   */
  export function runPostCompactCleanup(): void {
    // 1. 重置 cachedMC 状态（工具 ID 已过期）
    // 注意：如果 cachedMC 尚未初始化，cachedMCState 为 null
    // 实现时通过导入的模块级 resetter 处理

    // 2. 使系统上下文缓存失效
    invalidateSystemContextCache()

    // 3. 清除会话消息缓存（如果有）
    try {
      // 未来: clearSessionMessagesCache()
    } catch {
      // 忽略 — 该模块可能有或没有缓存
    }
  }

  复杂度: 低。核心函数 ~30 行，直接调用已有函数。

  ---
  实施方案

  ┌─────┬──────────┬────────────────────────────────┬───────┬────────────────┐
  │  #  │   特性   │              文件              │ 新增  │      依赖      │
  │     │          │                                │ 行数  │                │
  ├─────┼──────────┼────────────────────────────────┼───────┼────────────────┤
  │ 2-4 │ Snip     │ services/compact/snipCompact.t │ ~150  │ 消息 UUID 系统 │
  │     │ Compact  │ s（新建）                      │       │                │
  ├─────┼──────────┼────────────────────────────────┼───────┼────────────────┤
  │ 2-4 │ Snip     │ services/messages/apiProjectio │ ~30   │ ConversationBu │
  │     │ 集成     │ n.ts                           │       │ ffers          │
  ├─────┼──────────┼────────────────────────────────┼───────┼────────────────┤
  │ 2-4 │ Force-sn │ commands/force-snip.ts（新建） │ ~40   │ Snip 模块      │
  │     │ ip 命令  │                                │       │                │
  ├─────┼──────────┼────────────────────────────────┼───────┼────────────────┤
  │     │ Cached   │ services/compact/cachedMicroco │       │                │
  │ 2-5 │ MC       │ mpact.ts（新建）               │ ~80   │ 无             │
  │     │ 状态机   │                                │       │                │
  ├─────┼──────────┼────────────────────────────────┼───────┼────────────────┤
  │ 2-5 │ Cached   │ query.ts                       │ ~40   │ Cached MC 模块 │
  │     │ MC 集成  │                                │       │                │
  ├─────┼──────────┼────────────────────────────────┼───────┼────────────────┤
  │ 2-5 │ API      │ services/api/claude.ts         │ ~30   │ Beta header    │
  │     │ 层支持   │                                │       │                │
  ├─────┼──────────┼────────────────────────────────┼───────┼────────────────┤
  │     │ Post-com │ services/compact/postCompactCl │       │ context、cache │
  │ 2-6 │ pact     │ eanup.ts（新建）               │ ~30   │ dMC            │
  │     │ cleanup  │                                │       │                │
  ├─────┼──────────┼────────────────────────────────┼───────┼────────────────┤
  │ 2-6 │ Cleanup  │ services/compact/reactiveCompa │ ~3    │ runPostCompact │
  │     │ 集成     │ ct.ts                          │       │ Cleanup        │
  ├─────┼──────────┼────────────────────────────────┼───────┼────────────────┤
  │ 2-6 │ Cleanup  │ services/compact/autoCompact.t │ ~3    │ runPostCompact │
  │     │ 集成     │ s                              │       │ Cleanup        │
  └─────┴──────────┴────────────────────────────────┴───────┴────────────────┘

  总计新增约 410 行，零新依赖。

  ---
  实施建议顺序

  1. Snip Compact 最简单 — 纯逻辑无 API 依赖，做完即可用
  2. Post-Compact Cleanup 最简单 — 调用已有函数
  3. Cached Microcompact 最复杂 — 需要 API 层理解 cache_edits 协议

  需要我开始写入代码吗？

✻ Churned for 7m 50s