# 查询引擎与 API 层对比

## 文件规模

| 模块 | 完整版 | mini-v8 |
|------|--------|---------|
| 查询引擎核心 | query.ts (1,913 行) + QueryEngine.ts (1,301 行) + query/ (5 文件) | entrypoints/cli.ts (部分内联) + services/messages/ |
| API 客户端 | services/api/ (~38 文件) | services/api/ (4 文件) |

## 查询引擎对比

### query.ts（完整版核心）

完整版的 `query.ts` 是一个企业级查询循环，包含：

- **Memory 预取**: 会话记忆预取、项目记忆预取、自动压缩
- **工具编排**: StreamingToolExecutor、工具编排、工具结果预算
- **自治生命周期**: autonomy queue 管理、可消耗命令、命令生命周期 hooks
- **可观测性**: Langfuse tracing、GrowthBook feature flags、分析日志、查询 profiler checkpoints
- **错误处理**: prompt-too-long 检测、API 重试 + fallback、图片校验/缩放错误
- **预取**: memory prefetch、skill search prefetch、extra tools search prefetch
- **Token 预算**: turn token budget tracking、context window 估算、max output tokens 恢复
- **Feature flags**: REACTIVE_COMPACT, CONTEXT_COLLAPSE, HISTORY_SNIP, BG_SESSIONS, TEMPLATES, EXPERIMENTAL_SKILL_SEARCH, EXPERIMENTAL_SEARCH_EXTRA_TOOLS
- **Post-sampling hooks**: executePostSamplingHooks, executeStopFailureHooks, handleStopHooks
- **模块化子目录**: `src/query/` 下 5 个模块（config, deps, stopHooks, tokenBudget, transitions）

### QueryEngine.ts（完整版 SDK 封装）

- **SDK 集成**: 完整 SDKMessage, SDKStatus, SDKCompactBoundaryMessage, SDKPermissionDenial 类型
- **权限/编排**: Orphaned permission handling, structured output enforcement, coordinator mode 集成
- **Thinking 支持**: Extended thinking (max_thinking_length), effort-based thinking
- **状态管理**: File state cache, file history snapshots, scratchpad 集成
- **用户输入处理**: 完整 ProcessUserInputContext pipeline
- **Provider/Model**: 运行时 model 选择, thinking config, 用户指定 model 解析
- **System prompt**: 多部分 system prompt 组装, CLAUDE.md 注入
- **导出**: `ask()` 便利函数（200+ 行参数）

### mini-v8 查询引擎

mini-v8 没有独立的 query.ts 或 QueryEngine.ts。查询逻辑分散在：

| 文件 | 用途 |
|------|------|
| `entrypoints/cli.ts` | 主循环入口，读取输入 → 调用 API → 执行工具 → 输出结果 |
| `services/messages/messageProjection.ts` | 消息投影管道（microcompact → budget → compact → trim） |
| `services/compact/autoCompact.ts` | 自动压缩（token 阈值触发 + message 裁剪） |

## API 客户端对比

### Provider 支持

| Provider | 完整版 | mini-v8 |
|----------|--------|---------|
| Anthropic (first-party) | YES | YES |
| OpenAI Compatible | YES | YES |
| Google Gemini | YES | NO |
| xAI Grok | YES | NO |
| AWS Bedrock | YES | NO |
| GCP Vertex AI | YES | NO |
| Azure AI Foundry | YES | NO |

### 完整版 API 层能力（mini-v8 完全缺失）

1. **多 Provider 认证体系** — AWS IAM, GCP SA, Azure AD, OAuth
2. **Prompt Cache** — cache break detection, cache control headers
3. **费率限制** — rateLimitMessages, rateLimitMocking, mockRateLimits
4. **用量管理** — usage.ts, providerUsage 追踪, overageCreditGrant
5. **文件 API** — filesApi.ts（文件上传/下载）
6. **Admin API** — adminRequests.ts
7. **Session Ingress** — sessionIngress.ts
8. **Referral 系统** — referral.ts
9. **Metrics Opt-out** — metricsOptOut.ts
10. **Ultra Review** — ultrareviewPreflight.ts, ultrareviewQuota.ts
11. **错误增强** — errorUtils.ts, prompt-too-long detection
12. **Grove** — grove.ts 内部 API 客户端
13. **Bootstrap** — api/bootstrap.ts
14. **Logging** — logging.ts, dumpPrompts.ts

## 消息投影管线对比

| 步骤 | 完整版（21 文件） | mini-v8（2 文件） |
|------|-------------------|-------------------|
| 微压缩 | cached microcompact + API microcompact | microcompactToolResults (autoCompact.ts 内) |
| 工具结果预算 | applyToolResultBudget（独立模块） | applyToolResultBudget (autoCompact.ts 内) |
| 消息裁剪 | 分组 compact + snip compact + reactive compact | compactMessages (autoCompact.ts 内) |
| 会话记忆 | session memory compact | 缺失 |
| 截断投影 | snip compact projection | 缺失 |
| 时间感知 | time-based MC config | 缺失 |
| 后处理 | post-compact cleanup, compact warning hooks | 缺失 |

## 关键功能缺失清单

### 完全缺失

1. **query.ts / QueryEngine.ts** — 独立查询引擎不存在，逻辑内联在 entrypoint
2. **src/query/ 模块化目录** — 无 config/deps/stopHooks/tokenBudget/transitions 子模块
3. **多 Provider (5 个)** — Gemini, Grok, Bedrock, Vertex, Foundry
4. **Analytics 集成** — Langfuse, GrowthBook 零覆盖
5. **Feature Flag System** — 无 feature('X') 模式
6. **Prompt Cache** — 无缓存检测、无 cache control
7. **Thinking 配置** — 无 extended thinking 支持
8. **自治生命周期** — 无 autonomy queue 管理
9. **SDK 封装** — 无 QueryEngine 的 SDK 类型和便利函数
10. **文件 API** — 无文件上传/下载
11. **速率限制** — 无 rate limiting 和 mocking
12. **错误分类** — 无 prompt-too-long 专项处理
13. **Admin/Internal API** — 无 admin requests, grove, ultra review

### 部分覆盖

1. **消息投影** — 核心链路存在 (microcompact → budget → compact)，但策略单一
2. **API 流式调用** — Anthropic + OpenAI 双通道完整，但无常量/betas 管理
3. **压缩** — 基础 token 阈值 + 裁剪存在，缺多策略和边界处理

## 总结

mini-v8 的查询引擎和 API 层是一个**实用主义的简化版**：
- API 调用核心链路完整（2 个 Provider、流式调用、消息序列化）
- 消息投影管道核心三步齐全
- 但所有"增强"层完全缺失：无缓存、无分析、无多 Provider、无 feature flag、无速率控制

完整版的 query.ts + QueryEngine.ts + api/ 约 4,000+ 行业务逻辑，mini-v8 等效代码约 500 行，覆盖核心链路约 **12%**。
