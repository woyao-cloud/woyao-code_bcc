# 服务层对比

## 文件规模对比

| 版本 | 服务模块数 | 源文件数 | 测试文件数 |
|------|-----------|---------|-----------|
| 完整版 src | 20 | ~145 | ~68 |
| mini-v8 | 10 | ~20 | 5 |
| 覆盖比例 | 50% | **14%** | 7% |

## 各服务模块对比

### API 层

| 方面 | 完整版 | mini-v8 |
|------|--------|---------|
| 文件数 | ~38 | 4 |
| Provider 数 | 7 (Anthropic, OpenAI, Gemini, Grok, Bedrock, Vertex, Foundry) | 2 (Anthropic, OpenAI) |
| 认证方式 | API Key, AWS IAM, GCP SA, Azure AD, OAuth | API Key |
| 重试机制 | withRetry + fallback 触发 | 无 |
| 缓存 | prompt cache break detection | 无 |
| 用量追踪 | usage.ts + emptyUsage.ts | 基础累加 |
| 文件 API | filesApi.ts | 无 |
| 管理请求 | adminRequests.ts | 无 |
| 错误分类 | prompt-too-long + rate limit + connection errors | 基础错误处理 |

### MCP（差距最大: 97%）

| 方面 | 完整版（31 文件） | mini-v8（1 文件, 217 行） |
|------|------------------|--------------------------|
| 传输层 | InProcessTransport, SSE, WebSocket | stdio 子进程 |
| 认证 | OAuth, XAA, channel allowlist | 无 |
| 权限 | permission channels, notifications | 无 |
| 配置 | env expansion, normalization, types | 单 JSON 文件读取 |
| 注册表 | official registry | 无 |
| MCP 资源 | ListMcpResourcesTool, ReadMcpResourceTool | 无 |
| IDE 集成 | VS Code SDK integration | 无 |

### Memory（覆盖最好: ~70%）

| 方面 | 完整版 | mini-v8 |
|------|--------|---------|
| 本地记忆 | memoryStore.ts (382 行) — 完整 CRUD + tags + 搜索 + 导入导出 | 一致 |
| 会话记忆 | sessionMemory.ts (497 行) — 自动提取 + 持久化 + prompt 注入 | 一致 |
| 云端记忆 | memoryStoresClient.ts (189 行) — CRUD + 版本管理 | 一致 |
| 团队同步 | teamMemorySync.ts (443 行) — 增量同步 + ETag | 一致 |
| 多存储 | multiStore.ts | 缺失 |
| 提示模板 | prompts.ts | 缺失 |

**评价**: Memory 是 mini-v8 最完整的模块，四层记忆体系全部覆盖，团队同步含增量上传和 ETag 拉取。

### Compaction

| 方面 | 完整版（21 文件） | mini-v8（1 文件, 789 行） |
|------|-------------------|--------------------------|
| 自动压缩 | 支持（多策略） | autoCompact.ts（token 阈值 + message 裁剪） |
| 工具结果预算 | applyToolResultBudget | 合并入 autoCompact.ts |
| 微压缩 | cache 微压缩 + API 微压缩 | 合并入 autoCompact.ts |
| 截断式压缩 | snip compact + projection | 缺失 |
| 反应式压缩 | reactiveCompact.ts | 缺失 |
| 分组压缩 | grouping compact | 缺失 |
| 时间感知配置 | time-based MC config | 缺失 |
| 会话记忆压缩 | session memory compact | 缺失 |
| 后处理 | post-compact cleanup, warning hooks | 缺失 |

### Skill

| 方面 | 完整版（51 文件） | mini-v8（2 文件, 331 行） |
|------|-------------------|--------------------------|
| 本地加载 | 支持 | skillLoader.ts（项目/用户/插件目录发现） |
| 远程商店 | 支持 | skillStore.ts（list/search/install/uninstall + 缓存） |
| 自学习 | skillLearning (39 文件): 进化/观察/本能/生成/节流/提升 | 完全缺失 |
| 搜索 | skillSearch (12 文件): 预取/意图归一化/信号/遥测 | 完全缺失 |

### 完全缺失的服务模块（10 个）

| 模块 | 完整版规模 | 说明 |
|------|-----------|------|
| **AgentSummary** | 6 文件 | Agent 总结生成管线 |
| **MagicDocs** | 3 文件 | 文档自动生成 |
| **PromptSuggestion** | 2 文件 | Prompt 推测/建议 |
| **ACP** | 9 文件 | Agent Communication Protocol |
| **Analytics** | 9 文件 | Datadog, GrowthBook, 遥测 |
| **Auth** | 4 文件 | Host guard, workspace key |
| **autoDream** | 4 文件 | Auto-dream 合并 |
| **Langfuse** | 2 文件 | 可观测性集成 |
| **LSP** | 1 文件 | 语言服务器协议 |
| **SkillLearning/SkillSearch** | 51 文件 | Skill 自学习与搜索 |
| **providerRegistry/Usage** | 4 文件 | Provider 兼容矩阵与用量 |

### mini-v8 新增模块

| 模块 | 文件数 | 说明 |
|------|--------|------|
| config | 1 (83 行) | 简单 JSON 读写 + 缓存，无 schema 校验 |
| context | 1 (10 行) | 缓存版本计数器（trivial） |
| permission | 1 (86 行) | 交互式权限提示 + 会话级别缓存 |
| session | 1 (179 行) | 会话快照序列化 + 版本管理 |
| retry | 1 (72 行) | API 调用重试封装 |
| taskStore | 1 (63 行) | 内存 Map<String, Task> CRUD |

## 总结

mini-v8 的服务层覆盖率为完整版的 **14%**（按源文件数）。覆盖不均匀：**Memory 模块最完整（~70%）**，API 和 Compaction 为简化版，其余 10 个模块完全缺失。缺失模块主要集中在企业级功能（Analytics, ACP, Langfuse, LSP, Voice）和 AI 增强体系（SkillLearning, SkillSearch, MagicDocs, PromptSuggestion）。
