# Services 差距分析

## 现状

mini-v8 `services/` 有 33 文件（11 子目录）。完整版有 **115 文件** (含更多子目录)。

## mini-v8 已有的服务

| 服务 | 文件数 | 状态 |
|------|--------|------|
| `api/` | 4 | 2 providers (Anthropic + OpenAI) |
| `compact/` | 2 | autoCompact + reactiveCompact (已完成) |
| `config/` | 1 | configManager |
| `context/` | 1 | contextCacheState |
| `mcp/` | 1 | mcpClient |
| `memory/` | 7 | memoryStore, sessionMemory, teamMemorySync |
| `messages/` | 2 | apiProjection |
| `permission/` | 4 | permissionManager + ruleParser + permissions + loader |
| `session/` | 2 | sessionStore |
| `skill/` | 2 | skillLoader + skillStore |
| `tools/` | 2 | toolExecution + toolOrchestration (已完成) |

## 完整版有而 mini 没有的服务

### P0 (核心功能)

| 服务 | 文件数 | 说明 |
|------|--------|------|
| `api/` 额外提供商 | 5+ | Bedrock, Vertex, Foundry, Gemini, Grok — 约 200-500 行/个 |
| `compact/compact.ts` | 1 | Forked-agent 完整压缩 (~1751 行) |
| `lsp/` | 5+ | LSP 服务器管理器 |
| `MagicDocs/` | 5+ | 自动文档生成 |

### P1 (重要扩展)

| 服务 | 文件数 | 说明 |
|------|--------|------|
| `analytics/` | 5+ | 使用统计 (GrowthBook, Langfuse) |
| `auth/` | 3+ | OAuth 认证流程 |
| `plugins/` | 3+ | 插件系统 (已有简化版) |
| `skillLearning/` | 5+ | 技能学习 (自动从使用中学习) |
| `searchExtraTools/` | 3+ | 工具发现系统 |
| `SessionMemory/` | 5+ | 增强会话记忆 (已有简化版) |

### P2 (辅助)

| 服务 | 文件数 | 说明 |
|------|--------|------|
| `toolUseSummary/` | 3+ | 工具使用摘要 |
| `settingsSync/` | 3+ | 设置同步 |
| `oauth/` | 3+ | OAuth 刷新流程 |
| `providerRegistry/` | 3+ | 提供者注册 |
| `providerUsage/` | 5+ | 提供者使用统计 |
| `policyLimits/` | 3+ | 策略限制 |
| `tips/` | 3+ | 使用提示 |
| `rateLimitMessages/` | 2+ | 速率限制消息 |

### P3 (特定)

| 服务 | 文件数 | 说明 |
|------|--------|------|
| `autoDream/` | 2+ | 自动梦境 |
| `extractMemories/` | 3+ | 记忆提取 |
| `PromptSuggestion/` | 3+ | 提示建议 |
| `contextCollapse/` | 2+ | 上下文坍缩 |
| `vcr.ts` | 1 | VCR 回放系统 |
| `voice.ts` | 3+ | 语音支持 |
| `doubaoSTT.ts` | 1 | 语音转文字 |
| `notifier.ts` | 1 | 通知系统 |
| `internalLogging.ts` | 1 | 内部日志 |
| `langfuse/` | 5+ | Langfuse 可观测性 |
| `acp/` | 5+ | ACP 协议支持 |
| `AgentSummary/` | 3+ | Agent 摘要 |
| `remoteManagedSettings/` | 3+ | 远程管理设置 |
| `mcpServerApproval.tsx` | 1 | MCP 服务器审批 |
| `claudeAiLimits.ts` | 1 | API 限制 |
| `tokenEstimation.ts` | 1 | Token 估算 |
| `preventSleep.ts` | 1 | 防休眠 |

## 推荐

- 增加 Gemini/Grok 兼容层 (API provider，代码量小但覆盖广)
- 优先实现 `lsp/` 和 `MagicDocs/` (代码智能核心)
- analytics 可暂缓 (mini 不需要遥测)
- voice/MagicDocs 等需要特定系统依赖的暂缓
