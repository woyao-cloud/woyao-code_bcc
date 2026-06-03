# 第一阶段：API 兼容计划

> 目标：将 mini-v9 的核心接口类型对齐到完整版，实现 API 级别的兼容。
> 预估工期：2 周
> 工作单元：8 个任务

---

## 目录

1. [背景与目标](#1-背景与目标)
2. [阶段 1a — Tool 接口类型对齐](#2-阶段-1a--tool-接口类型对齐)
3. [阶段 1b — Message 类型对齐](#3-阶段-1b--message-类型对齐)
4. [阶段 1c — API 请求/响应格式对齐](#4-阶段-1c--api-请求响应格式对齐)
5. [阶段 1d — QueryEngine 对齐](#5-阶段-1d--queryengine-对齐)
6. [所有变更文件清单](#6-所有变更文件清单)
7. [优先级与风险](#7-优先级与风险)

---

## 1. 背景与目标

### 当前状态

```
完整版 Tool.ts          mini-v9 Tool.ts
─────────────────────   ─────────────────────
813 行                  471 行
30+ 字段 ToolUseContext  8 字段 ToolUseContext
泛型 Tool<I,O,P>        简单 Tool 接口
Zod v4 schema           简单 JSON schema
80+ 字段 Tool           30+ 字段 Tool
readonly Tool[]         Map<string, Tool>
render* 方法 (10+)      无渲染方法
```

### 对齐目标

- **核心接口** (Tool, ToolUseContext, ToolResult, Tools) 类型对齐
- **消息类型** 兼容完整版子集
- **API 调用格式** 兼容完整版协议
- **QueryEngine** 增加完整版生命周期钩子
- **最小侵入原则** — 只修改类型签名不改现有工具实现，保留 mini-v9 独有的 Workflow/Git/Cron 工具不变

---

## 2. 阶段 1a — Tool 接口类型对齐

### 2.1 ToolUseContext 对齐 (高优先级)

**完整版有、mini-v9 缺失的关键字段**：

| 字段 | 类型 | 说明 | mini-v9 是否需要 |
|------|------|------|-----------------|
| `options` | 嵌套对象 (commands, tools, model, mcpClients 等) | 会话配置 | **是** — 核心 |
| `messages` | Message[] | 全部消息 | **已有** |
| `toolUse` | ToolUseBlockParam | 当前工具块 | **已有** |
| `tools` | Tools | 当前工具列表 | **缺失** — 需添加 |
| `setAppState` | 函数 | 状态更新 | **否** — mini-v9 无 AppState |
| `setToolJSX` | 函数 | 渲染 JSX | **否** — mini-v9 无 Ink |
| `appendSystemMessage` | 函数 | 追加系统消息 | **中** — 可选 |
| `langfuseTrace` | 对象 | 跟踪 | **否** |
| `mcpClients` | MCPServerConnection[] | MCP 连接 | **是** — 核心 |
| `mcpResources` | ServerResource[] | MCP 资源 | **中** |
| `agentId` | AgentId | Agent ID | **是** — 已有 ids.ts |
| `agentType` | string | Agent 类型 | **是** |
| `queryTracking` | QueryChainTracking | 追踪链 | **中** |

**计划修改** (`mini-v9/src/Tool.ts`):

```typescript
// 新增字段到 ToolUseContext
export interface ToolUseContext {
  toolUse: ToolUseBlockParam
  permissionMode: PermissionMode
  toolPermissionContext: ToolPermissionContext
  cwd: string
  abortSignal: AbortSignal
  messages: Message[]
  isInteractive: boolean
  
  // === 新增字段 (对齐完整版) ===
  
  /** 当前可用工具列表 */
  tools?: Tools
  
  /** 会话配置选项 */
  options?: {
    commands?: Command[]
    tools?: Tools
    mainLoopModel?: string
    verbose?: boolean
    mcpClients?: unknown[]
    mcpResources?: Record<string, unknown[]>
  }
  
  /** 追加系统消息 (仅在交互式模式下) */
  appendSystemMessage?: (msg: SystemMessage) => void
  
  /** Agent 身份 (子 Agent 运行时设置) */
  agentId?: AgentId
  agentType?: string
  
  /** 查询追踪链 */
  queryTracking?: QueryChainTracking
  
  /** 当前对话的所有消息 */
  // (已有 messages)
}
```

**影响范围**: 所有工具实现文件 (47 个) 需要重新导出 test，但已有字段保持兼容，新增字段都是可选 (`?`)。

### 2.2 ToolResult 对齐 (高优先级)

```typescript
// 当前 mini-v9 (简单)
export interface ToolResult {
  content: string
  rendered?: string
  success: boolean
  error?: string
  metadata?: Record<string, unknown>
}

// 对齐完整版 (泛型)
export interface ToolResult<T = string> {
  data: T
  newMessages?: (UserMessage | AssistantMessage | SystemMessage)[]
  contextModifier?: (context: ToolUseContext) => ToolUseContext
  mcpMeta?: {
    _meta?: Record<string, unknown>
    structuredContent?: Record<string, unknown>
  }
}
```

**迁移策略**:
1. 新增 `ToolResult<T>` 泛型，保留 `ToolResult<string>` 作为默认
2. 新增 `createSuccessResult()` / `createErrorResult()` 兼容函数
3. 现有工具使用 `ToolResult` 的地方逐步迁移
4. **不破坏**现有 `execute()` 签名 — 兼容层自动转换

### 2.3 Tool 接口泛型化 (高优先级)

**目标**: 从简单接口改为完整版的泛型模式，但保留简化版 `buildTool()`。

```typescript
// 对齐后的 Tool 签名
export interface Tool<
  Input extends Record<string, unknown> = Record<string, unknown>,
  Output = unknown,
> {
  name: string
  description: string
  inputSchema: ToolInputSchema
  prompt: string
  execute(context: ToolUseContext, input: Input): Promise<ToolResult<Output>>
  
  // 可选方法 (完整版对齐)
  canUse?(context: ToolUseContext, input: Input): Promise<PermissionResult>
  userFacingName?(input?: Partial<Input>): string
  aliases?: string[]
  requiresConfirmation?: boolean
  category?: ToolCategory
  deprecated?: boolean
  deprecationMessage?: string
  
  // 并发与安全 (对齐完整版)
  isConcurrencySafe?(input: Input): boolean
  isReadOnly?(input: Input): boolean
  isDestructive?(input: Input): boolean
  
  // 校验
  checkPermissions?(context: ToolUseContext, input: Input): Promise<PermissionResult>
  validateInput?(input: Input, context: ToolUseContext): Promise<ValidationResult>
  maxResultSizeChars?: number
  
  // MCP
  isMcp?: boolean
  mcpInfo?: { serverName: string; toolName: string }
}
```

### 2.4 Tools 类型对齐 (中优先级)

```typescript
// 当前: Map<string, Tool>
export type Tools = Map<string, Tool>

// 对齐后: readonly Tool[] (保持 Map 作为内部实现)
export type Tools = readonly Tool[]

// 兼容层:
export function toolsToMap(tools: Tools): Map<string, Tool>
export function findToolByName(tools: Tools, name: string): Tool | undefined
export function toolMatchesName(tool: Tool, name: string): boolean
```

**迁移策略**: 内部保留 Map 实现，但向外暴露 readonly Tool[] 类型。所有模块在 2 周过渡期内两套都支持。

### 2.5 buildTool 对齐 (低优先级)

完整版的 `buildTool()` 使用 `TOOL_DEFAULTS` + spread + `BuiltTool<D>` 通用类型。mini-v9 保持自己的简化版，但确保 `ToolConfig` 包含完整版的全部字段。

```typescript
// mini-v9 保持自己的 buildTool，但扩展 ToolConfig
export type ToolConfig<Input, Output> = {
  name: string
  description: string
  inputSchema: ToolInputJSONSchema
  prompt: string
  execute: (context: ToolUseContext, input: Input) => Promise<ToolResult<Output>>
  canUse?: ...
  userFacingName?: () => string
  aliases?: string[]
  requiresConfirmation?: boolean
  category?: ToolCategory
  isConcurrencySafe?: (input: Input) => boolean  // 新增
  isReadOnly?: (input: Input) => boolean         // 新增
  isDestructive?: (input: Input) => boolean      // 新增
  validateInput?: ...                            // 新增
  maxResultSizeChars?: number                    // 新增
  isMcp?: boolean                                // 新增
  mcpInfo?: { serverName: string; toolName: string }  // 新增
}
```

### 2.6 ValidationResult 对齐 (中优先级)

```typescript
// 当前 mini-v9
export interface ValidationResult {
  valid: boolean
  error?: string
}

// 对齐完整版
export type ValidationResult =
  | { result: true }
  | { result: false; message: string; errorCode: number }
```

### 2.7 PermissionType 对齐 (中优先级)

对比 `mini-v9/src/types/permissions.ts` vs 完整版 `src/types/permissions.ts`:

```typescript
// 当前 mini-v9 有的
PermissionMode, PermissionBehavior, PermissionRuleValue
PermissionUpdateDestination, PermissionUpdate
AdditionalWorkingDirectory, ToolPermissionContext
getEmptyToolPermissionContext(), PermissionResult

// 缺失的
ToolPermissionRulesBySource, isBypassPermissionsModeAvailable 的嵌套结构
prePlanMode? (在完整版 ToolPermissionContext 中)
shouldAvoidPermissionPrompts?, awaitAutomatedChecksBeforeDialog?
```

---

## 3. 阶段 1b — Message 类型对齐

### 3.1 当前对比

| 维度 | 完整版 | Mini-v9 |
|------|--------|---------|
| 源文件 | `@ant/model-provider` 包 (外部) | `src/types/message.ts` (本地) |
| 消息类型 | 30+ (含 Progress, Attachment, Tombstone 等) | 5 |
| ContentItem | 丰富 (含 ImageBlockParam, DocumentBlock 等) | 简单 TextBlock/ToolUse/ToolResult |
| StreamEvent | 复杂 (含 thinking, signal 等) | 9 种简单事件 |

### 3.2 需要添加的消息类型

```typescript
// === 新增消息类型 (从完整版引入) ===

/** 进度消息 (工具执行中的进度更新) */
export interface ProgressMessage {
  type: 'progress'
  data: { type: string; [key: string]: unknown }
  uuid: string
  timestamp: string
}

/** 附件消息 (文件附件) */
export interface AttachmentMessage {
  type: 'attachment'
  attachment: { type: string; [key: string]: unknown }
  uuid: string
  timestamp: string
}

/** 工具使用摘要消息 (紧凑展示) */
export interface ToolUseSummaryMessage {
  type: 'tool_use_summary'
  [key: string]: unknown
}

/** 系统压缩边界消息 (已存在，对齐接口) */
// SystemCompactBoundaryMessage (已有)

/** Thinking 块消息 */
export interface SystemThinkingMessage {
  type: 'system_thinking'
  message: { content: string }
  uuid: string
  timestamp: string
}
```

### 3.3 ContentItem 扩展

```typescript
// 扩展 ContentItem 以支持完整版的更多块类型
export type ContentItem =
  | TextBlockParam
  | ToolUseBlockParam
  | ToolResultBlockParam
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'thinking'; thinking: string; signature?: string }
```

### 3.4 Message 联合类型扩展

```typescript
export type Message =
  | UserMessage
  | AssistantMessage
  | SystemMessage
  | SystemAPIErrorMessage
  | SystemCompactBoundaryMessage    // 已有
  | ProgressMessage                 // NEW
  | AttachmentMessage               // NEW
  | SystemThinkingMessage           // NEW
  | ToolUseSummaryMessage           // NEW
```

---

## 4. 阶段 1c — API 请求/响应格式对齐

### 4.1 QueryParams 对齐

```typescript
// 当前 mini-v9
export interface QueryParams {
  systemPrompt: string
  messages: BetaMessageParam[]
  tools: Tool[]
  model?: string
  signal?: AbortSignal
  maxTokens?: number
}

// 对齐完整版 (增加字段)
export interface QueryParams {
  systemPrompt: string
  messages: BetaMessageParam[]
  tools: Tool[]
  model?: string
  signal?: AbortSignal
  maxTokens?: number
  
  // === 新增 ===
  /** 思考配置 */
  thinking?: { type: 'enabled'; budget_tokens: number }
  /** 工具选择策略 */
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string }
  /** 额外请求参数 */
  extraHeaders?: Record<string, string>
  /** 自定义基础 URL */
  baseURL?: string
}
```

### 4.2 StreamEvent 对齐

```typescript
// 当前 mini-v9 StreamEvent (9 种)
type: 'content_block_start' | 'content_block_delta' | 'content_block_stop'
    | 'message_start' | 'message_delta' | 'message_stop'
    | 'error'

// 对齐完整版 (扩展事件类型)
export type StreamEvent = BetaRawMessageStreamEvent  // 使用 SDK 原生类型
```

### 4.3 工具 Schema 转换对齐

完整版使用 Zod v4 schema，mini-v9 使用 JSON schema。对齐策略：

1. 内部保留 JSON schema（mini-v9 简化路线）
2. API 调用层自动转换 JSON schema → Anthropic API 格式
3. 不引入 Zod 依赖

```typescript
// 已有的转换 (保持不变)
function toolToAPISchema(tool: Tool): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }
}
```

---

## 5. 阶段 1d — QueryEngine 对齐

### 5.1 QueryEngineOptions 对齐

```typescript
// 当前 mini-v9
export interface QueryEngineOptions {
  systemPrompt?: string
  messages?: BetaMessageParam[]
  tools?: Tool[]
  maxTurns?: number
  model?: string
}

// 对齐完整版
export interface QueryEngineOptions {
  systemPrompt?: string
  messages?: BetaMessageParam[]
  tools?: Tool[]
  maxTurns?: number
  model?: string
  fallbackModel?: string          // 新增 — 降级模型
  abortSignal?: AbortSignal       // 新增 — 外部中止信号
  isInteractive?: boolean         // 新增
  onSystemContext?: (messages: BetaMessageParam[]) => Promise<string>  // 新增
}
```

### 5.2 QueryEngine 新增方法

```typescript
// 保持 mini-v9 的简洁 API，增加以下方法

export class QueryEngine {
  // 已有
  submitMessage(userInput: string): AsyncGenerator<QueryEvent>
  interrupt(): void
  setModel(model: string): void
  setTools(tools: Tool[]): void
  getTotalInputTokens(): number
  getTotalOutputTokens(): number
  getTurnCount(): number
  
  // === 新增 ===
  
  /** 重置统计 */
  resetStats(): void
  
  /** 获取格式化摘要 */
  getSummary(): {
    turnCount: number
    totalInputTokens: number
    totalOutputTokens: number
    cacheHitRate?: number
  }
  
  /** 获取是否可继续交互 */
  canContinue(): boolean
}
```

### 5.3 QueryEvent 对齐

```typescript
// 当前 QueryEvent 类型 (来自 transitions.ts)
export type QueryEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; name: string; content: string; success: boolean; isError: boolean }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'turn_end'; turnCount: number; toolUseCount: number }
  | { type: 'terminal'; reason: string; ... }
  | { type: 'error'; message: string }
  | { type: 'retry_event'; ... }
  | { type: 'recovery'; reason: string; attempt: number }
  | { type: 'cache_warning'; hitRate: number; threshold: number; ... }
```

已足够丰富，不需要额外类型。

---

## 6. 所有变更文件清单

### 需要修改的文件 (10 个)

| 文件 | 修改内容 | 复杂度 | 影响范围 |
|------|---------|--------|---------|
| `src/Tool.ts` | ToolUseContext 扩充、ToolResult 泛型化、Tool 接口泛型化、Tools 类型对齐 | **高** | 47 个工具 |
| `src/types/tool.ts` | ToolConfig 增加字段、TypedTool 泛型对齐、ValidationResult 对齐 | 中 | 引用方 |
| `src/types/message.ts` | 新增 ProgressMessage/AttachmentMessage/ThinkingMessage 类型 | 中 | query.ts |
| `src/types/permissions.ts` | 对齐 ToolPermissionRulesBySource、追加可选字段 | 低 | 引用方 |
| `src/services/api/claude.ts` | QueryParams 增加 thinking/tool_choice/extraHeaders | 低 | API 调用方 |
| `src/query.ts` | QueryOptions 增加 fallbackModel/isInteractive/onSystemContext | 中 | QueryEngine |
| `src/QueryEngine.ts` | QueryEngineOptions 对齐、增加 resetStats/canContinue | 低 | 外部调用方 |
| `src/query/transitions.ts` | 无需修改 (已覆盖完整版子集) | 无 | - |
| `src/tools/tools.ts` | 适配 Tools 类型变化 | 低 | 工具注册 |
| `src/types/ids.ts` | 检查和补充 AgentId 等 ID 类型 | 低 | types |

### 新增文件 (2 个)

| 文件 | 说明 |
|------|------|
| `src/types/stream.ts` | 扩展 StreamEvent 类型定义 |
| `src/services/api/errors.ts` | 统一 API 错误类型 (已有简化版，需增强) |

### 不需要修改的工具文件 (47 个)

和 Tool 接口交互但不受 Tool 类型变化影响——因为接口变化向后兼容。

---

## 7. 优先级与风险

### 执行顺序

```
第1天-第3天: ToolUseContext 扩充 (2.1)
第4天-第5天: ToolResult 泛型化 (2.2)
第6天-第7天: Tool 接口泛型化 + Tools 对齐 (2.3-2.4)
第8天-第9天: Message 类型扩充 (3)
第10天-第11天: API QueryParams 对齐 (4) + API errors.ts 增强
第12天-第13天: QueryEngine 对齐 (5)
第14天: 集成测试 + 回归测试
```

### 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| ToolUseContext 扩充导致工具编译错误 | **中** | 全部新增字段设为可选 `?` |
| Tools 从 Map 改为 readonly[] 破坏引用方 | **中** | 兼容层保留 Map 访问能力 |
| 47 个工具需要重新导出测试 | **低** | 接口向后兼容，测试不变 |
| Message 类型扩展影响序列化 | **低** | 仅新增类型，不影响旧类型 |
| precheck 新增类型/lint 错误 | **中** | 逐任务运行 `bun run precheck` |

### 验证标准

```
1. bun run typecheck → 零错误
2. bun test → 全部通过 (45 个)
3. 所有现有工具 execute() 签名不变
4. ToolUseContext 新增字段在工具中可选访问
5. query.ts 可同时接受新旧消息格式
```