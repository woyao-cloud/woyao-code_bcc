 详细变更清单

  1. Tool 接口类型对齐 (Tool.ts)

  - ToolUseContext: 从 8 字段 → 16+ 字段（新增 tools, options, agentId, agentType, queryTracking, mcpClients, mcpResources, toolUseId,
  appendSystemMessage），全部可选 向后兼容
  - ToolResultV2: 新增泛型 ToolResultV2<T>（含 data, newMessages, contextModifier, mcpMeta），兼容原有 ToolResult
  - Tools 类型: 从 Map<string, Tool> → readonly Tool[]（保留 toolsToMap() 兼容函数）
  - findToolByName: 同时支持 Tools（数组）和 Map 参数
  - Tool 接口: 增加 isConcurrencySafe, isDestructive, validateInput, maxResultSizeChars, mcpInfo, checkPermissions
  - ValidationResult: 对齐联合类型 {result:true} | {result:false;message;errorCode}

  2. Message 类型对齐 (types/message.ts)

  - 新增 ProgressMessage, AttachmentMessage, SystemThinkingMessage, ToolUseSummaryMessage
  - 新增 ExtendedContentItem（image, thinking 块）
  - Message 联合类型从 5 → 9

  3. API 请求/响应格式对齐 (services/api/claude.ts)

  - QueryParams 增加 thinking, tool_choice, baseURL, extraHeaders
  - query.ts QueryOptions 增加 thinking, tool_choice, baseURL

  4. QueryEngine 对齐 (QueryEngine.ts)

  - QueryEngineOptions 增加 fallbackModel, abortSignal, isInteractive, onSystemContext
  - 新增 resetStats(), getSummary(), canContinue() 方法
  - 统计追踪扩展（totalCacheCreationInputTokens, totalCacheReadInputTokens）

  5. 权限类型对齐 (types/permissions.ts)

  - 新增 ToolPermissionRulesBySource, shouldAvoidPermissionPrompts, awaitAutomatedChecksBeforeDialog, prePlanMode, alwaysAskRules, isAutoModeAvailable

  6. IDs 类型扩展 (types/ids.ts)

  - 新增 MessageUuid brand 类型
  - 新增 QueryChainTracking 类型

  7. 工具配置扩展 (types/tool.ts)

  - ToolConfig 和 TypedTool 增加 searchHint 字段

  ---
  验证标准全部通过 ✅

  1. ✅ bun run typecheck — 零新错误
  2. ✅ bun test — 721 pass / 1 fail（预先存在的）
  3. ✅ 所有现有工具 execute() 签名不变
  4. ✅ ToolUseContext 新增字段全部可选
  5. ✅ query.ts 可同时接受新旧消息格式
