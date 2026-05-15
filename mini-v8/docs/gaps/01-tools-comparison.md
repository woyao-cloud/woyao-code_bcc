# 工具系统对比

## 数量对比

| 版本 | 工具数量 | Tool 接口复杂度 |
|------|---------|----------------|
| 完整版 src | ~53 | ~35 个属性/方法 |
| mini-v8 | 19 | ~12 个属性/方法 |

## mini-v8 保留的工具（19 个）

| 工具 | 类别 | 与完整版一致度 |
|------|------|--------------|
| AgentTool | Agent 系统 | 高（语义一致，简化版） |
| ApplyPatchTool | 文件编辑 | mini-v8 独有（完整版合并入 FileEditTool） |
| BashTool | Shell | 高 |
| EnterPlanModeTool | 规划 | 中（完整版有 V2 版） |
| ExitPlanModeTool | 规划 | 中 |
| FileEditTool | 文件 | 高 |
| FileReadTool | 文件 | 高 |
| FileWriteTool | 文件 | 高 |
| GlobTool | 搜索 | 高 |
| GrepTool | 搜索 | 高 |
| MCPTool | MCP | 中（动态包装器模式） |
| SkillTool | Skill | 中 |
| TaskCreateTool | 任务 | 高 |
| TaskListTool | 任务 | 高 |
| TaskUpdateTool | 任务 | 高 |
| TeamCreateTool | 团队 | 中 |
| TeamDeleteTool | 团队 | 中 |
| WebFetchTool | Web | 高 |
| WebSearchTool | Web | 高 |

## 完整版有但 mini-v8 缺失的工具（34 个）

### 基础设施/编排（8 个）
- **AskUserQuestionTool** — 交互式用户提问
- **SendMessageTool** — 跨 Agent 消息传递
- **TaskOutputTool** — 读取子 Agent 任务输出
- **TaskStopTool** — 停止运行中的任务
- **TaskGetTool** — 读取单个任务详情
- **ExecuteTool** — 执行已发现的延迟工具
- **SearchExtraToolsTool** — 工具发现/延迟加载机制
- **SyntheticOutputTool** — 基础设施合成输出

### 配置/记忆/上下文（4 个）
- **ConfigTool** — 运行时配置 (/config)
- **BriefTool** — 会话简报
- **LocalMemoryRecallTool** — 项目记忆召回
- **CtxInspectTool** — 上下文检查

### 文件/编辑扩展（3 个）
- **NotebookEditTool** — Jupyter Notebook 编辑
- **TodoWriteTool** — Todo 列表管理
- **VaultHttpFetchTool** — 安全 HTTP 抓取

### Worktree/Plan Mode（3 个）
- **EnterWorktreeTool / ExitWorktreeTool** — Git worktree 管理
- **ExitPlanModeV2Tool** — V2 版计划模式退出
- **VerifyPlanExecutionTool** — 计划执行验证

### LSP/MCP 资源（3 个）
- **LSPTool** — 语言服务器协议集成
- **ListMcpResourcesTool / ReadMcpResourceTool** — MCP 资源访问

### Cron/调度（3 个）
- **CronCreateTool / CronDeleteTool / CronListTool** — 定时任务

### 终端/Shell（3 个）
- **PowerShellTool** — Windows PowerShell 执行
- **TerminalCaptureTool** — 终端输出捕获
- **REPLTool** — REPL 模式

### 协作/远程（4 个）
- **ListPeersTool** — 节点发现
- **RemoteTriggerTool** — 远程 Agent 触发
- **SendUserFileTool** — 文件发送
- **SubscribePRTool** — PR 订阅

### 展示/通知（3 个）
- **MonitorTool** — 后台文件/进程监控
- **PushNotificationTool** — 桌面通知
- **ReviewArtifactTool** — 审查工件渲染

## Tool 类型定义复杂度对比

### Tool 接口

| 方面 | 完整版 | mini-v8 |
|------|--------|---------|
| 身份标识 | name, aliases, searchHint, mcpInfo | name, aliases |
| Schema | inputSchema (Zod), inputJSONSchema, outputSchema | inputSchema (plain) |
| 执行 | call(5 params, async) | execute(2 params) |
| 权限 | checkPermissions, validateInput, preparePermissionMatcher, isDestructive, requiresUserInteraction | canUse (optional) |
| 描述 | description(async), prompt(async) | description(string), prompt(string) |
| UI 渲染 | 9 个 render 方法 | rendered?: string |
| 生命周期 | isEnabled, isReadOnly, isConcurrencySafe, interruptBehavior, isOpenWorld, shouldDefer, alwaysLoad | deprecated?, deprecationMessage? |
| 分类 | isSearchOrReadCommand, toAutoClassifierInput | category |

### ToolUseContext

| 完整版（~45 字段） | mini-v8（8 字段） |
|-------------------|-------------------|
| options (10+ 子字段), abortController, appState, notifications, fileReadingLimits, globLimits, toolDecisions, queryTracking, Langfuse tracing, denialTracking, contentReplacementState, renderedSystemPrompt, MCP clients, agent definitions... | toolUse, permissionMode, toolPermissionContext, cwd, abortSignal, messages, isInteractive |

### ToolResult

| 完整版 | mini-v8 |
|--------|---------|
| `ToolResult<T> = { data: T; newMessages?; contextModifier?; mcpMeta? }` | `{ content: string; rendered?: string; success: boolean; error?: string; metadata? }` |

## 关键差异点

1. **输入校验**: 完整版用 Zod schemas 做类型安全校验；mini-v8 用 `Record<string, unknown>` 裸类型
2. **UI 渲染**: 完整版有完整的 React/Ink 渲染管线；mini-v8 无任何 UI 渲染
3. **权限体系**: 完整版有多层权限检查 + 分级结果；mini-v8 只有 `canUse?` 可选回调
4. **生命周期**: 完整版支持并发安全检查、中断行为、开放世界判定、延迟加载；mini-v8 无
5. **mini-v8 的优点**: ToolRegistry 模式更清晰，`buildTool()` 工厂 + `createSuccessResult/createErrorResult` 辅助函数设计良好
