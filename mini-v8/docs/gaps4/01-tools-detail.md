# 工具系统详细对比

## 完整版工具清单 (packages/builtin-tools/src/tools/)

完整版共 **58 个工具目录** (不含 shared/、src/、testing/ 辅助目录)。

mini-v8 共 **37 个工具**。

## 逐工具对比

### 文件操作 (完整版 6, mini-v8 6 — 100%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| FileReadTool | ✅ | ✅ | |
| FileWriteTool | ✅ | ✅ | |
| FileEditTool | ✅ | ✅ | |
| GrepTool | ✅ | ✅ | |
| GlobTool | ✅ | ✅ | |
| BashTool | ✅ | ✅ | |

### Shell (完整版 3, mini-v8 2 — 67%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| BashTool | ✅ | ✅ | |
| PowerShellTool | ✅ | ✅ | |
| REPLTool | ✅ | ❌ | **缺失** |

### 网络/Web (完整版 3, mini-v8 3 — 100%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| WebFetchTool | ✅ | ✅ | |
| WebSearchTool | ✅ | ✅ | |
| WebBrowserTool | ✅ | ✅ | |

### Agent 系统 (完整版 9, mini-v8 9 — 100%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| AgentTool | ✅ | ✅ | |
| TaskCreateTool | ✅ | ✅ | |
| TaskUpdateTool | ✅ | ✅ | |
| TaskListTool | ✅ | ✅ | |
| TaskGetTool | ✅ | ✅ | |
| TaskOutputTool | ✅ | ✅ | |
| TaskStopTool | ✅ | ✅ | |
| TeamCreateTool | ✅ | ✅ | |
| TeamDeleteTool | ✅ | ✅ | |

### Agent 协作 (完整版 6, mini-v8 4 — 67%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| AskUserQuestionTool | ✅ | ✅ | |
| SendMessageTool | ✅ | ✅ | |
| SendUserFileTool | ✅ | ✅ | |
| SleepTool | ✅ | ✅ | |
| TodoWriteTool | ✅ | ✅ | |
| PushNotificationTool | ✅ | ❌ | **缺失** |

### 规划 (完整版 3, mini-v8 3 — 100%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| EnterPlanModeTool | ✅ | ✅ | |
| ExitPlanModeTool | ✅ | ✅ | |
| VerifyPlanExecutionTool | ✅ | ✅ | |

### 配置/系统 (完整版 4, mini-v8 4 — 100%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| ConfigTool | ✅ | ✅ | |
| BriefTool | ✅ | ✅ | |
| SkillTool | ✅ | ✅ | |
| LSPTool | ✅ | ✅ | |

### Worktree (完整版 2, mini-v8 0 — 0%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| EnterWorktreeTool | ✅ | ❌ | **缺失** |
| ExitWorktreeTool | ✅ | ❌ | **缺失** |

### MCP 生态 (完整版 4, mini-v8 1 — 25%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| MCPTool | ✅ | ✅ | |
| McpAuthTool | ✅ | ❌ | **缺失** |
| ListMcpResourcesTool | ✅ | ❌ | **缺失** |
| ReadMcpResourceTool | ✅ | ❌ | **缺失** |

### Cron (完整版 1, mini-v8 3)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| ScheduleCronTool | ✅ | ❌ | 统一调度 |
| CronCreateTool | ❌ | ✅ | mini-v8 拆分 |
| CronDeleteTool | ❌ | ✅ | mini-v8 拆分 |
| CronListTool | ❌ | ✅ | mini-v8 拆分 |

> mini-v8 将完整版的一个 ScheduleCronTool 拆分为 3 个独立工具（Create/Delete/List），接口更清晰。

### 延迟工具链 (完整版 3, mini-v8 0 — 0%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| SearchExtraToolsTool | ✅ | ❌ | **关键缺失** |
| SyntheticOutputTool | ✅ | ❌ | **关键缺失** |
| ExecuteTool | ✅ | ❌ | **关键缺失** |

> 延迟工具三件套是完整版工具发现系统的基础：SearchExtraToolsTool 搜索工具索引，SyntheticOutputTool 生成合成输出，ExecuteTool 执行额外工具。

### 技能系统 (完整版 1, mini-v8 0 — 0%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| DiscoverSkillsTool | ✅ | ❌ | **缺失** |

### 上下文/调试 (完整版 3, mini-v8 0 — 0%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| CtxInspectTool | ✅ | ❌ | **缺失** |
| SnipTool | ✅ | ❌ | **缺失** |
| MonitorTool | ✅ | ❌ | **缺失** |

### 工作流/自动化 (完整版 5, mini-v8 0 — 0%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| WorkflowTool | ✅ | ❌ | **缺失** |
| SubscribePRTool | ✅ | ❌ | **缺失** |
| SuggestBackgroundPRTool | ✅ | ❌ | **缺失** |
| RemoteTriggerTool | ✅ | ❌ | **缺失** |
| TerminalCaptureTool | ✅ | ❌ | **缺失** |

### 本地/安全 (完整版 4, mini-v8 0 — 0%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| LocalMemoryRecallTool | ✅ | ❌ | **缺失** |
| ListPeersTool | ✅ | ❌ | **缺失** |
| VaultHttpFetchTool | ✅ | ❌ | **缺失** |
| NotebookEditTool | ✅ | ✅ | 跨分类 |

### 低优先/测试 (完整版 3, mini-v8 0)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| ReviewArtifactTool | ✅ | ❌ | P5 |
| TungstenTool | ✅ | ❌ | P5 |
| OverflowTestTool | ✅ | ❌ | 测试工具 |

### 补丁 (完整版 1, mini-v8 1 — 100%)

| 工具 | 完整版 | mini-v8 | 备注 |
|------|--------|---------|------|
| ApplyPatchTool | ✅ | ✅ | |

## 工具缺失原因总结

| 类型 | 缺失数 | 原因 |
|------|--------|------|
| 延迟工具链 | 3 | 需要先实现 searchExtraTools/ 服务层和工具索引 |
| MCP 生态 | 3 | 需要增强 mcpClient -> 完整的 MCP 连接管理 |
| Worktree | 2 | 需要 git worktree 底层支持 |
| 工作流/自动化 | 5 | 依赖外部系统 (GitHub API, 终端捕获) |
| 上下文/调试 | 3 | 需要上下文分析基础设施 |
| 低优先 | 9 | REPL, DiscoverSkills, LocalMemoryRecall 等 |
