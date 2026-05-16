# mini-v8 追平完整版工具系统计划

## 现状 vs 目标

### mini-v8 当前状况

```
src/Tool.ts — 简单 Tool 接口 (8 字段)
src/tools/tools.ts — 静态 getTools() + MCP 追加
src/tools/builtin/ — 18 个内置工具
  ├── 文件: Bash, Read, Write, Edit, Grep, Glob, ApplyPatch
  ├── 网络: WebFetch, WebSearch
  ├── Agent: AgentTool, TaskCreate/Update/List
  ├── 团队: TeamCreate/Delete
  ├── 规划: EnterPlanMode, ExitPlanMode
  └── 其他: SkillTool, MCPTool
```

### 完整版目标

```
packages/builtin-tools/ — ~60 个工具
src/Tool.ts — 丰富 Tool<Input,Output,Progress> 泛型接口 (50+ 字段)
src/tools.ts — 动态加载 + feature flag + MCP 合并
src/services/tools/ — 编排引擎
  ├── toolOrchestration.ts — runTools() 并发/串行分批
  ├── StreamingToolExecutor.ts — 流式队列执行
  ├── toolExecution.ts — 完整生命周期 (验证 → hook → 权限 → 执行 → 结果映射)
src/utils/permissions/ — 权限体系
  ├── permissions.ts — hasPermissionsToUseTool()
  ├── permissionsLoader.ts — 规则加载
  ├── permissionRuleParser.ts — 规则解析
  └── shellRuleMatching.ts — Shell 规则匹配
```

## Phase 1: Tool 接口升级

### 动机
当前 `Tool` 接口缺少并发安全、权限钩子、输入验证、结果映射等关键能力，限制了编排和权限系统的发展。

### 改动清单

#### 1.1 扩展 `src/Tool.ts`

```typescript
// 新增字段
interface Tool {
  // ... 现有字段不变 ...

  // 并发安全
  isConcurrencySafe?(input: Record<string, unknown>): boolean
  isReadOnly?(input: Record<string, unknown>): boolean
  isDestructive?(input: Record<string, unknown>): boolean

  // 权限
  checkPermissions?(context: ToolUseContext, input: Record<string, unknown>): Promise<PermissionResult>

  // 输入验证
  validateInput?(input: Record<string, unknown>, context: ToolUseContext): Promise<ValidationResult>

  // 结果映射
  maxResultSizeChars?: number
  mapToolResult?(content: string, toolUseId: string): ContentItem

  // MCP 标识
  isMcp?: boolean
  mcpInfo?: { serverName: string; toolName: string }
}
```

#### 1.2 添加 `buildTool()` 工厂

```typescript
export function buildTool(config: Partial<Tool> & { name: string; execute: ... }): Tool
// 提供安全默认值：
//   isEnabled → true
//   isConcurrencySafe → false
//   isReadOnly → false
//   checkPermissions → { behavior: 'allow' }
```

#### 1.3 更新现有工具

逐个为 18 个工具添加缺失的字段：

| 工具 | isConcurrencySafe | isReadOnly | isDestructive |
|------|-------------------|------------|---------------|
| Grep | true | true | false |
| Glob | true | true | false |
| Read | true | true | false |
| WebFetch | true | true | false |
| WebSearch | true | true | false |
| Bash | false | false | true |
| Write | false | false | true |
| Edit | false | false | true |
| ApplyPatch | false | false | true |
| Agent | false | false | false |
| 其余 | false | false | false |

### 文件变动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/Tool.ts` | **修改** | 扩展接口 + 添加 buildTool |
| `src/types/tool.ts` | **修改** | 添加缺失的类型 |
| `src/tools/builtin/*.ts` | **修改** | 逐个工具添加新字段 |

---

## Phase 2: 工具注册表重构

### 动机
当前 `getTools()` 是纯静态列表，无法支持 feature flag 条件加载、懒加载、MCP 合并、去重。

### 改动清单

#### 2.1 重构 `src/tools/tools.ts`

```typescript
export function getAllBaseTools(): Tool[] {
  return [
    AgentTool, BashTool, FileReadTool,
    // ... 全部内置工具
    // feature 条件加载:
    ...(feature('POWERSHELL') ? [PowerShellTool] : []),
    // 环境条件:
    ...(process.env.ENABLE_LSP_TOOL ? [LSPTool] : []),
  ]
}

export function getTools(context?: PermissionContext): Tool[] {
  // 1. 获取基础工具列表
  // 2. 应用 deny 规则过滤
  // 3. 检查 isEnabled()
  // 4. 返回
}

export function assembleToolPool(
  context: PermissionContext,
  mcpTools: Tool[],
): Tool[] {
  // 合并内置 + MCP 工具
  // 去重 (内置优先)
  // 排序保证 prompt cache 稳定
}
```

#### 2.2 新增 `query.ts` 中的工具池构建

`QueryEngine` 在初始化时调用 `assembleToolPool()` 而非 `getTools()`。

### 文件变动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/tools/tools.ts` | **修改** | 改为动态注册 + assembleToolPool |
| `src/QueryEngine.ts` | **修改** | 使用 assembleToolPool |

---

## Phase 3: 新增 20+ 内置工具

### 优先级 P0 (高价值、低复杂度)

| 工具 | 行数估 | 说明 |
|------|--------|------|
| `TaskGetTool` | ~50 | 按 ID 查询单个任务详情 |
| `TaskOutputTool` | ~60 | 获取后台任务最终输出 |
| `TaskStopTool` | ~50 | 终止正在运行的任务 |
| `TodoWriteTool` | ~80 | 待办列表管理 (对标 TodoWrite in full) |
| `NotebookEditTool` | ~150 | Jupyter notebook cell 编辑 |
| `AskUserQuestionTool` | ~80 | 向用户提问并等待回答 |

### 优先级 P1 (中等价值)

| 工具 | 行数估 | 说明 |
|------|--------|------|
| `PowerShellTool` | ~120 | Windows PowerShell 执行器 |
| `WebBrowserTool` | ~200 | Puppeteer/Playwright 浏览器控制 |
| `ConfigTool` | ~100 | 读取/设置配置项 |
| `DiscoverSkillsTool` | ~80 | 技能发现与搜索 |
| `SleepTool` | ~30 | 延时工具 (等待指定毫秒) |
| `SendUserFileTool` | ~80 | 向用户发送文件内容 |

### 优先级 P2 (协作/规划)

| 工具 | 行数估 | 说明 |
|------|--------|------|
| `VerifyPlanExecutionTool` | ~80 | 验证计划执行结果 |
| `EnterWorktreeTool` / `ExitWorktreeTool` | ~200 | 工作树切换 |
| `SendMessageTool` | ~60 | Agent 间消息传递 |

### 优先级 P3 (MCP 集成)

| 工具 | 行数估 | 说明 |
|------|--------|------|
| `SearchExtraToolsTool` | ~100 | 发现延迟加载的工具 |
| `ExecuteTool` | ~80 | 执行已发现的工具 |
| `McpAuthTool` | ~120 | MCP OAuth 认证 |
| `ListMcpResourcesTool` / `ReadMcpResourceTool` | ~150 | MCP 资源访问 |

### 优先级 P4 (低优先级/价值低)

| 工具 | 说明 |
|------|------|
| `BriefTool` | 简报生成 |
| `TungstenTool` | 内部 Anthropic 工具 |
| `MonitorTool` | 系统监控 |
| `TerminalCaptureTool` | 终端捕获 |
| `WorkflowTool` | 工作流脚本 |
| `SubscribePRTool` / `SuggestBackgroundPRTool` | PR 协作 |

### 实现优先级细分

```
Phase 3a (P0): TaskGet/Output/Stop + TodoWrite + NotebookEdit + AskUserQuestion
Phase 3b (P1): PowerShell + WebBrowser + Config + DiscoverSkills + Sleep + SendUserFile
Phase 3c (P2): VerifyPlan + Worktree + SendMessage
Phase 3d (P3): MCP 工具增强
Phase 3e (P4): 其余低优先级工具
```

---

## Phase 4: 权限系统增强

### 动机
当前 `requestPermission()` 是简单的 if-else 判断。完整版有规则匹配、自动模式分类器、粒度控制。

### 改动清单

#### 4.1 新增 `src/services/permission/` 文件

```typescript
// permissionRuleParser.ts — 解析规则字符串 "Bash(git *)" 
export function parsePermissionRule(rule: string): PermissionRule

// permissions.ts — 核心权限判断
export async function hasPermissionsToUseTool(
  tool: Tool,
  input: Record<string, unknown>,
  context: PermissionContext,
): Promise<PermissionDecision>

// permissionsLoader.ts — 从 settings.json 加载规则
export function loadPermissionRules(): PermissionRule[]
```

#### 4.2 工具级 `checkPermissions()` 适配

每个工具可以提供自己的 `checkPermissions()` 方法（例如 `BashTool` 可以检查命令是否安全）。

#### 4.3 集成到 `query.ts`

当前 `query.ts` 中的权限检查改为调用 `hasPermissionsToUseTool()`。

### 文件变动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/permission/permissionRuleParser.ts` | **新增** | ~80 行 |
| `src/services/permission/permissions.ts` | **新增** | ~120 行 |
| `src/services/permission/permissionsLoader.ts` | **新增** | ~60 行 |
| `src/query.ts` | **修改** | 集成新权限系统 |
| `src/Tool.ts` | **修改** | 引用 PermissionResult 类型 |

---

## Phase 5: 工具编排引擎

### 动机
当前 `query.ts` 中的工具执行逻辑已支持基本的并发分批，但缺少完整版的高级功能：流式执行、错误级联、输入验证、结果映射、context modifiers。

### 改动清单

#### 5.1 新增 `src/services/tools/toolExecution.ts`

从 `query.ts` 提取单工具执行逻辑为独立函数：

```typescript
export async function* runToolUse(
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext,
  options?: {
    canUseTool?: CanUseToolFn
    onProgress?: (progress: unknown) => void
  },
): AsyncGenerator<ToolExecutionEvent>
```

#### 5.2 新增 `src/services/tools/toolOrchestration.ts`

```typescript
export function partitionToolCalls(
  toolCalls: Array<{ tool: Tool; input: Record<string, unknown> }>,
): Array<Array<{ tool: Tool; input: Record<string, unknown> }>>

export async function runToolsSerially(
  calls: Array<...>,
  context: ToolUseContext,
): Promise<ContentItem[]>

export async function runToolsConcurrently(
  calls: Array<...>,
  context: ToolUseContext,
  maxConcurrency?: number,
): Promise<ContentItem[]>
```

#### 5.3 简化 `query.ts`

将工具执行部分委托给 `toolOrchestration.ts`：

```typescript
// query.ts 当前 ~60 行的工具执行逻辑简化为：
const batches = partitionToolCalls(pendingTools)
for (const batch of batches) {
  const batchResults = isConcurrentBatch(batch)
    ? await runToolsConcurrently(batch, ...)
    : await runToolsSerially(batch, ...)
  // 处理结果
}
```

### 文件变动

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/tools/toolExecution.ts` | **新增** | ~150 行 |
| `src/services/tools/toolOrchestration.ts` | **新增** | ~120 行 |
| `src/query.ts` | **修改** | 委托给编排引擎 |

---

## 实现优先级与依赖

```
Phase 1: Tool 接口升级 (无依赖)
  └── 扩展接口 + buildTool 工厂

Phase 2: 工具注册表重构 (依赖 Phase 1)
  └── 动态加载 + assembleToolPool

Phase 3: 新增工具 (依赖 Phase 1, 可并行 Phase 2)
  ├── 3a: P0 工具 (TaskGet/Output/Stop, TodoWrite, NotebookEdit, AskUserQuestion)
  ├── 3b: P1 工具 (PowerShell, WebBrowser, Config, DiscoverSkills, Sleep, SendUserFile)
  ├── 3c: P2 工具 (VerifyPlan, Worktree, SendMessage)
  ├── 3d: P3 MCP 工具
  └── 3e: P4 低优先级

Phase 4: 权限系统增强 (依赖 Phase 1, 可并行 Phase 2+3)
  └── 规则解析 + 权限判断 + 集成

Phase 5: 工具编排引擎 (依赖 Phase 1, 可并行 Phase 2-4)
  └── toolExecution + toolOrchestration + query.ts 简化
```

```
依赖关系图：

Phase 1 (Tool 接口) ──┬── Phase 2 (注册表)
                       ├── Phase 3 (新增工具)
                       ├── Phase 4 (权限体系)
                       └── Phase 5 (编排引擎) ← 依赖 Phase 4
```

## 文件改动总览

### 修改现有文件

| 文件 | Phase | 改动 |
|------|-------|------|
| `src/Tool.ts` | 1 | 扩展接口 + buildTool 工厂 |
| `src/types/tool.ts` | 1 | 添加缺失类型 |
| `src/tools/tools.ts` | 2 | 动态注册 + assembleToolPool |
| `src/QueryEngine.ts` | 2 | 使用 assembleToolPool |
| `src/query.ts` | 4,5 | 委托权限 + 编排引擎 |
| `src/tools/builtin/*.ts` | 1 | 逐个添加 isConcurrencySafe 等字段 |

### 新增文件

| 文件 | Phase | 行数估 |
|------|-------|--------|
| `src/services/permission/permissionRuleParser.ts` | 4 | ~80 |
| `src/services/permission/permissions.ts` | 4 | ~120 |
| `src/services/permission/permissionsLoader.ts` | 4 | ~60 |
| `src/services/tools/toolExecution.ts` | 5 | ~150 |
| `src/services/tools/toolOrchestration.ts` | 5 | ~120 |
| `src/tools/builtin/TaskGetTool/TaskGetTool.ts` | 3a | ~50 |
| `src/tools/builtin/TaskOutputTool/TaskOutputTool.ts` | 3a | ~60 |
| `src/tools/builtin/TaskStopTool/TaskStopTool.ts` | 3a | ~50 |
| `src/tools/builtin/TodoWriteTool/TodoWriteTool.ts` | 3a | ~80 |
| `src/tools/builtin/NotebookEditTool/NotebookEditTool.ts` | 3a | ~150 |
| `src/tools/builtin/AskUserQuestionTool/AskUserQuestionTool.ts` | 3a | ~80 |
| `src/tools/builtin/PowerShellTool/PowerShellTool.ts` | 3b | ~120 |
| `src/tools/builtin/WebBrowserTool/WebBrowserTool.ts` | 3b | ~200 |
| `src/tools/builtin/ConfigTool/ConfigTool.ts` | 3b | ~100 |
| `src/tools/builtin/DiscoverSkillsTool/DiscoverSkillsTool.ts` | 3b | ~80 |
| `src/tools/builtin/SleepTool/SleepTool.ts` | 3b | ~30 |
| `src/tools/builtin/SendUserFileTool/SendUserFileTool.ts` | 3b | ~80 |
| (更多 P2-P4 工具) | 3c-e | ~500 合计 |

### 测试文件

| 文件 | Phase | 说明 |
|------|-------|------|
| `src/__tests__/tools/permissions.test.ts` | 4 | 权限规则解析 + 判断 |
| `src/__tests__/tools/toolOrchestration.test.ts` | 5 | 并发/串行分批 |
| (每个新增工具的独立测试) | 3 | ~30 行/个 |

## 风险与注意事项

1. **向后兼容** — 所有接口扩展加 `?`（可选），现有工具不强制实现新方法
2. **buildTool 迁移** — 新工具使用 `buildTool()` 工厂，老工具逐步迁移
3. **权限兼容** — `requestPermission()` 保留为 fallback，新系统通过 `hasPermissionsToUseTool()` 入口
4. **工具池性能** — `assembleToolPool()` 每次调用都排序/去重，建议在 conversation turn 外调用
5. **MCP 兼容** — MCP 工具命名规范 `mcp__server__tool` 保持一致
6. **增量交付** — 每个 Phase 独立可测试，不要一次性重写


Phase 1 (Tool 接口升级) 已完成。Typecheck 零新增错误。
改动总结
src/Tool.ts — 扩展 Tool 接口
- 新增 7 个可选字段：isConcurrencySafe、isReadOnly、isDestructive、checkPermissions、validateInput、maxResultSizeChars、isMcp、mcpInfo
- 新增 ValidationResult 接口
- buildTool() / buildStandardTool() 工厂自动传递所有新字段默认值
src/types/tool.ts — 同步扩展 ToolConfig 和 TypedTool
14 个工具文件更新 — 添加安全元数据：
| 工具 | isConcurrencySafe | isReadOnly | isDestructive |
|------|:---:|:---:|:---:|
| Grep, Glob, Read, WebFetch, WebSearch | ✅ true | ✅ true | ❌ false |
| Bash, Write, Edit, ApplyPatch | ❌ false | ❌ false | ✅ true |
| Skill, TaskList, EnterPlanMode, ExitPlanMode | ❌ false | ✅ true | ❌ false |
| Agent, TaskCreate, TaskUpdate, TeamCreate, TeamDelete | ❌ false | ❌ false | ❌ false |
MCPTool — createMCPToolWrapper 工厂现在从 MCP annotations 读取 readOnlyHint/destructiveHint，并注入 isMcp: true + mcpInfo
接下来可继续 Phase 2（注册表重构）或 Phase 3a（新增 P0 工具：TaskGet/Output/Stop 等）。继续？

# Phase 2 已完成。所有 12 个测试通过，typecheck 零新增错误。
改动总结
src/tools/tools.ts — 重构为三层架构
| 函数 | 说明 |
|------|------|
| getAllBaseTools() | 单一数据源，返回 18 个内置工具 |
| getTools() | 向后兼容，等效 [...getAllBaseTools(), ...mcpTools] |
| assembleToolPool(mcpTools?) | 合并内置 + MCP，按名去重（内置优先），按字母排序保证 prompt cache 稳定 |
QueryEngine 保持原样（接受已组装好的 tools 数组）。assembleToolPool 可供 agent runner 或其他需要自定义工具池的地方使用。
当前进度
| Phase | 状态 |
|-------|------|
| 1. Tool 接口升级 | ✅ |
| 2. 注册表重构 | ✅ |
| 3. 新增工具 | ⬜ |
| 4. 权限系统 | ⬜ |
| 5. 编排引擎 | ⬜ |
要继续 Phase 3a（新增 P0 工具）？

# Phase 3a 已完成。Typecheck 零错误 + 12/12 测试通过。
新增 5 个工具
| 工具 | 行数 | 说明 |
|------|------|------|
| TaskGet | 55 | 按 ID 查询用户任务详情（title/status/description/result） |
| TaskOutput | 66 | 获取后台 agent 任务输出（status/content/tokens/error） |
| TaskStop | 55 | 终止运行中的后台 agent 任务（调用 agentTaskStore.kill()） |
| TodoWrite | 94 | 待办列表管理（add/complete/list 三个命令） |
| AskUserQuestion | 63 | 向用户提问并等待 stdin 回答 |
工具总数
18（原有）+ 5（新增）= 23 个内置工具
当前进度
| Phase | 状态 |
|-------|------|
| 1. Tool 接口升级 | ✅ |
| 2. 注册表重构 | ✅ |
| 3a. P0 工具 | ✅ |
| 3b. P1 工具 (PowerShell, WebBrowser, Config, etc.) | ⬜ |
| 3c-3e. P2-P4 | ⬜ |
| 4. 权限系统 | ⬜ |
| 5. 编排引擎 | ⬜ |
继续加 P1 工具？