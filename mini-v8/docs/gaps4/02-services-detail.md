# 服务层详细对比

## 完整版 31 个服务子目录 — mini-v8 覆盖度矩阵

### 1. `api/` — 完整版 30 files, mini-v8 ~6 files (20%)

| 子模块 | 完整版 | mini-v8 | 状态 |
|--------|--------|---------|------|
| `claude.ts` (核心) | ✅ | ✅ | 完整 |
| `openai/` | ✅ 5 files | ⚠️ 3 files | 缺 responsesAdapter, chatgptAuth |
| `gemini/` | ✅ 2 files | ✅ 3 files | 完整 |
| `grok/` | ✅ 3 files | ❌ | **缺失** |
| `adminRequests.ts` | ✅ | ❌ | 管理 API |
| `bedrockClient.ts` | ✅ | ❌ | AWS Bedrock |
| `bootstrap.ts` | ✅ | ❌ | API 启动 |
| `client.ts` | ✅ | ❌ | 通用客户端 |
| `dumpPrompts.ts` | ✅ | ❌ | 调试 |
| `errorUtils.ts` | ✅ | ❌ | 错误处理 |
| `filesApi.ts` | ✅ | ❌ | 文件 API |
| `promptCacheBreakDetection.ts` | ✅ | ❌ | 缓存检测 |
| `sessionIngress.ts` | ✅ | ❌ | 会话入口 |
| `ultrareviewPreflight.ts` | ✅ | ❌ | 审查预检查 |
| `withRetry.ts` | ✅ | ❌ | 重试 |
| 其他 | ✅ ~10 | ❌ | usage, errors, logging etc |

### 2. `compact/` — 完整版 16 files, mini-v8 2 files (13%)

| 文件 | 完整版 | mini-v8 | 状态 |
|------|--------|---------|------|
| `autoCompact.ts` | ✅ | ✅ | |
| `reactiveCompact.ts` | ✅ | ✅ | |
| `compact.ts` | ✅ | ❌ | 核心压缩逻辑(大文件) |
| `microCompact.ts` | ✅ | ❌ | 微压缩 |
| `apiMicrocompact.ts` | ✅ | ❌ | API 微压缩 |
| `cachedMicrocompact.ts` | ✅ | ❌ | 缓存微压缩 |
| `cachedMCConfig.ts` | ✅ | ❌ | 缓存配置 |
| `grouping.ts` | ✅ | ❌ | 消息分组 |
| `prompt.ts` | ✅ | ❌ | 压缩提示 |
| `snipCompact.ts` | ✅ | ❌ | 裁剪压缩 |
| `snipProjection.ts` | ✅ | ❌ | 裁剪投影 |
| `postCompactCleanup.ts` | ✅ | ❌ | 压缩后清理 |
| `compactWarningHook.ts` | ✅ | ❌ | 警告 hook |
| `timeBasedMCConfig.ts` | ✅ | ❌ | 时间配置 |
| `sessionMemoryCompact.ts` | ✅ | ❌ | 会话记忆压缩 |

### 3. `mcp/` — 完整版 26 files, mini-v8 1 file (4%)

mini-v8 仅有 `mcpClient.ts`，缺失：

- `MCPConnectionManager.tsx` — MCP 连接管理
- `channelAllowlist.ts` — 通道白名单
- `channelNotification.ts` — 通道通知
- `channelPermissions.ts` — 通道权限
- `auth.ts` — MCP 认证
- `config.ts` — MCP 配置
- `elicitationHandler.ts` — 引导处理器
- `envExpansion.ts` — 环境变量展开
- `headersHelper.ts` — HTTP headers
- `InProcessTransport.ts` — 进程内传输
- `normalization.ts` — 规范化
- `oauthPort.ts` — OAuth 端口
- `officialRegistry.ts` — 官方注册表
- `SdkControlTransport.ts` — SDK 控制传输
- `useManageMCPConnections.ts` — MCP 连接管理 hook
- `utils.ts` — 工具函数
- `vscodeSdkMcp.ts` — VS Code SDK
- `xaa.ts` — XAA 集成
- `xaaIdpLogin.ts` — XAA IdP 登录
- `mcpStringUtils.ts`
- `claudeai.ts`

### 4. `memory/` — 完整版 ~10 files, mini-v8 7 files (~70%)

| 功能 | mini-v8 | 完整版 | 状态 |
|------|---------|--------|------|
| memoryStore | ✅ | ✅ | |
| sessionMemory | ✅ | ✅ | |
| teamMemorySync | ✅ | ✅ | |
| memoryStoresClient | ✅ | ✅ | |
| memdir | ✅ | ✅ | |
| findRelevantMemories | ✅ | ✅ | |
| memoryAge | ✅ | ✅ | |
| multiStore | ❌ | ✅ | 多存储后端 |
| prompts | ❌ | ✅ | 记忆提示 |
| sessionMemoryUtils | ❌ | ✅ | 工具函数 |
| types/versions | ❌ | ✅ | 类型/版本 |

### 5. `lsp/` — 完整版 8 files, mini-v8 2 files (25%)

| 文件 | mini-v8 | 完整版 | 状态 |
|------|---------|--------|------|
| `manager.ts` | ✅ | ✅ | |
| `client.ts` | ✅ | ✅ | |
| `LSPClient.ts` | ❌ | ✅ | LSP 客户端 |
| `LSPDiagnosticRegistry.ts` | ❌ | ✅ | 诊断注册 |
| `LSPServerInstance.ts` | ❌ | ✅ | 服务器实例 |
| `LSPServerManager.ts` | ❌ | ✅ | 服务器管理 |
| `config.ts` | ❌ | ✅ | LSP 配置 |
| `passiveFeedback.ts` | ❌ | ✅ | 被动反馈 |
| `types.ts` | ❌ | ✅ | 类型 |

### 6. `tools/` — 完整版 4 files, mini-v8 2 files (50%)

| 文件 | mini-v8 | 完整版 | 状态 |
|------|---------|--------|------|
| `toolExecution.ts` | ✅ | ✅ | |
| `toolOrchestration.ts` | ✅ | ✅ | |
| `toolHooks.ts` | ❌ | ✅ | 工具 hook |
| `StreamingToolExecutor.ts` | ❌ | ✅ | 流式执行 |

### 7. `permission/` — 完整版 ~40 files, mini-v8 4 files (~70% 核心)

mini-v8 有：permissionManager, permissionRuleParser, permissions, permissionsLoader

缺失完整版的 `utils/permissions/` 子目录 (24 files):
- classifierDecision, classifierShared, bashClassifier
- denialTracking, yoloClassifier
- autoModeState, bypassPermissionsKillswitch
- getNextPermissionMode, permissionExplainer, permissionSetup
- pathValidation, dangerousPatterns, filesystem
- shadowedRuleDetection, shellRuleMatching
- PermissionMode, PermissionRule, PermissionResult, PermissionUpdate, PermissionUpdateSchema
- PermissionPromptToolResultSchema

### 8. 完全缺失的服务

| 服务 | 文件数 | 功能 | 优先级 |
|------|--------|------|--------|
| `acp/` | 6 | Agent 通信协议 | P4 |
| `AgentSummary/` | 3 | Agent 摘要 | P3 |
| `analytics/` | 9 | 分析/遥测 | P5 |
| `auth/` (服务层) | 2 | 主机守卫+工作区密钥 | P3 |
| `autoDream/` | 4 | 后台巩固 | P4 |
| `contextCollapse/` | 3 | 上下文折叠 | P5 |
| `extractMemories/` | 2 | 记忆提取 | P3 |
| `langfuse/` | 5 | Langfuse 集成 | P5 |
| `localVault/` | 2 | 本地凭证 | P4 |
| `MagicDocs/` | 2 | 魔法文档 | P5 |
| `oauth/` | 6 | OAuth 认证 | P3 |
| `plugins/` (服务层) | 3 | 插件管理 | P3 |
| `policyLimits/` | 2 | 策略限制 | P5 |
| `PromptSuggestion/` | 2 | 提示建议 | P4 |
| `providerRegistry/` | 4 | 提供商注册表 | P3 |
| `providerUsage/` | 6 | 用量追踪 | P4 |
| `remoteManagedSettings/` | 5 | 远程设置 | P5 |
| `searchExtraTools/` | 2 | 额外工具搜索 | P1 |
| `SessionMemory/` | 4 | 跨会话记忆 | P3 |
| `sessionTranscript/` | 1 | 会话转录 | P4 |
| `settingsSync/` | 2 | 设置同步 | P5 |
| `skillLearning/` | 15 | 技能学习 | P5 |
| `skillSearch/` | 7 | 技能搜索 | P3 |
| `tips/` | 4 | 提示系统 | P5 |
| `toolUseSummary/` | 1 | 工具使用摘要 | P4 |

### 根级服务文件 — mini-v8 覆盖

| 文件 | mini-v8 | 说明 |
|------|---------|------|
| `planMode.ts` | ✅ | |
| `retry.ts` | ✅ | |
| `taskStore.ts` | ✅ | |
| `notificationQueue.ts` | ✅ | |
| `toolResultStorage.ts` | ✅ | |
| `awaySummary.ts` | ❌ | 远离摘要 |
| `claudeAiLimits.ts` | ❌ | AI 限制 |
| `diagnosticTracking.ts` | ❌ | 诊断追踪 |
| `doubaoSTT.ts` | ❌ | 豆包语音 |
| `internalLogging.ts` | ❌ | 内部日志 |
| `mcpServerApproval.tsx` | ❌ | MCP 审批 UI |
| `notifier.ts` | ❌ | 桌面通知 |
| `preventSleep.ts` | ❌ | 防休眠 |
| `tokenEstimation.ts` | ❌ | Token 估算 |
| `voice.ts` | ❌ | 语音 |
