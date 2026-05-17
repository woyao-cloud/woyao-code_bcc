# 工具系统差距分析

## 现状

mini-v8 已有 30 个内置工具 + 编排引擎 + 权限规则系统。完整版约 **60 个工具** + 3 个编排模块。

## 已完成的工作

| 模块 | 状态 | 说明 |
|------|------|------|
| Tool 接口升级 | ✅ | isConcurrencySafe, isReadOnly, isDestructive, checkPermissions, validateInput, isMcp |
| 注册表重构 | ✅ | getAllBaseTools + assembleToolPool |
| P0 工具 (5) | ✅ | TaskGet, TaskOutput, TaskStop, TodoWrite, AskUserQuestion |
| P1 工具 (4) | ✅ | Sleep, Config, PowerShell, SendUserFile |
| P2 工具 (3) | ✅ | VerifyPlanExecution, SendMessage, Brief |
| 编排引擎 | ✅ | toolExecution.ts + toolOrchestration.ts |
| 权限规则 | ✅ | permissionRuleParser + permissions + permissionsLoader |

## 尚未实现的工具

### P0 (高价值)

| 工具 | 估量 | 说明 | 依赖 |
|------|------|------|------|
| **WebBrowserTool** | ~200 行 | Playwright/Puppeteer 浏览器控制 | 需要 npm 依赖 |
| **LSPTool** | ~150 行 | LSP 服务器集成 | 需要 LSP 客户端 |
| **NotebookEditTool** | ~150 行 | Jupyter notebook 编辑 | 低 |

### P1 (中等)

| 工具 | 估量 | 说明 | 依赖 |
|------|------|------|------|
| **SearchExtraToolsTool** | ~100 | 发现延迟加载工具 | MCP deferred 机制 |
| **ExecuteTool** | ~80 | 执行已发现工具 | SearchExtraToolsTool |
| **McpAuthTool** | ~120 | MCP OAuth 认证 | MCP auth 协议 |
| **DiscoverSkillsTool** | ~80 | 技能发现 | SkillTool 已有类似功能 |

### P2 (协作)

| 工具 | 估量 | 说明 | 依赖 |
|------|------|------|------|
| **EnterWorktreeTool** | ~100 | 进入工作树 | worktree 管理系统 |
| **ExitWorktreeTool** | ~80 | 退出工作树 | worktree 管理系统 |
| **CronCreateTool** | ~80 | 创建定时任务 | 调度系统 |
| **CronDeleteTool** | ~60 | 删除定时任务 | 调度系统 |
| **CronListTool** | ~50 | 列出定时任务 | 调度系统 |

### P3 (MCP)

| 工具 | 估量 | 说明 |
|------|------|------|
| **ListMcpResourcesTool** | ~80 | MCP 资源列表 |
| **ReadMcpResourceTool** | ~80 | 读取 MCP 资源 |

### P4 (低优先级)

| 工具 | 说明 |
|------|------|
| **SubscribePRTool** | PR 订阅 |
| **SuggestBackgroundPRTool** | 后台 PR 建议 |
| **TerminalCaptureTool** | 终端捕获 |
| **MonitorTool** | 系统监控 |
| **WorkflowTool** | 工作流脚本 |
| **SnipTool** | 历史片段 |

## 编排引擎差距

| 特性 | 完整版 | mini-v8 |
|------|--------|---------|
| 并发执行 | ✅ StreamingToolExecutor + runTools | ✅ toolOrchestration (Promise.all, max 5) |
| 错误级联 | ✅ Bash 错误取消同级 | ❌ 无 |
| 流式执行 | ✅ 流式到达即执行 | ❌ 等待流完成再执行 |
| 输入验证 | ✅ Zod schema 解析 | ❌ 无 (需 validateInput) |
| PreToolUse hooks | ✅ 自定义 hook 链 | ❌ 无 |
| PostToolUse hooks | ✅ MCP 输出可被 hook | ❌ 无 |
| Context modifiers | ✅ 修改后续上下文 | ❌ 无 |
| 推迟加载 | ✅ shouldDefer + SearchExtraTools | ❌ 无 |
| 自动分类器 | ✅ Bash 自动允许分类 | ❌ 无 |

## 推荐

- 优先实现 WebBrowserTool + LSPTool (高用户价值)
- 编排引擎增加流式执行 (性能提升)
- MCP 工具集待 MCP 协议完善后补充
