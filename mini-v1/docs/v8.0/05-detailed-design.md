# Claude Code Mini v8 - 详细设计文档

> 版本: 8.0.0 | 日期: 2026-05-14

---

## 1. 入口设计

### 文件: src/entrypoints/cli.ts (646行)

**职责**: CLI 入口 + REPL 循环 + 多模式分发

**主函数**: `main()`

```
main():
  1. 设置 MACRO 全局 (VERSION, BUILD_TIME)
  2. resetTasks() 清空任务列表
  3. 验证 API Key
  4. loadConfig() 加载配置
  5. loadAllPlugins() 加载插件
  6. initAgentRegistry() 初始化 Agent 注册
  7. initSession() 初始化会话记忆
  8. connectMCPServers() + registerMCPTools()
  9. 模式分支:
     - Pipe/Args: runHeadless(prompt)
     - TTY: runREPL()
```

**runHeadless(prompt)**:
- 构建 1 条 user message
- 调用 processConversation 循环
- 输出结果后退出

**runREPL()**:
- 显示启动信息
- readline 读取用户输入
- 检查 / 命令前缀 -> 路由到 Commands
- 普通消息 -> processConversation

**processConversation(messages)**:
```
while true:
  1. needsCompaction? -> compactMessages()
  2. streamClaudeAPI() -> 流式接收
     - text_delta -> 累积到 fullText
     - content_block_start(tool_use) -> 记录
     - input_json_delta -> 累积 JSON
  3. 输出 fullText
  4. 如有 tool_uses:
     for each toolUse:
       - 权限检查
       - 构建 ToolUseContext
       - tool.execute()
       - 收集 tool_result
     - 追加到 messages
  5. 无 tool_uses -> break
  6. shouldExtractMemory? -> 提取
```

---

## 2. Agent 系统详细设计

### 2.1 agentTypes.ts (228行)

| 类型 | 关键字段 | 用途 |
|------|------|------|
| AgentSource | built-in/user/project/plugin/local | Agent来源枚举 |
| AgentDefinition | agentType, whenToUse, tools, disallowedTools, getSystemPrompt, maxTurns, source | Agent蓝图 |
| AgentInstance | id, definition, status, task, result[], turnCount, tokens | 运行实例 |
| AgentStatus | idle/running/completed/failed/cancelled | 状态机 |
| TeamDefinition | name, leadAgentId, members[] | 团队定义 |
| TeamMember | agentId, name, agentType, role, isActive | 团队成员 |
| AgentRunContext | agentId, agentType, teamName, isTeamLead, startTime | 执行上下文 |
| AgentResult | agentId, status, content[], totalTokens, totalToolUseCount, durationMs | 执行结果 |

### 2.2 agentRegistry.ts (245行)

**数据结构**: `Map<string, AgentDefinition>`

| 函数 | 说明 |
|------|------|
| initAgentRegistry(cwd, plugins[]) | 初始化: 内置+用户+项目+插件来源 |
| registerAgent(agent) | 注册，优先级: plugin > project > user > built-in |
| getAgent(agentType) | 按类型查询 AgentDefinition |
| getAllAgents() | 获取全部已注册 Agent |
| searchAgents(query) | 按名称/描述搜索 |
| getAgentsForPrompt() | 格式化为系统提示词 |

**Agent Markdown 解析**:
- Frontmatter: YAML-like key: value
- 字段: agentType, whenToUse, description, tools, disallowedTools, skills, model, maxTurns, permissionMode, color, background, initialPrompt
- Body 部分作为 System Prompt 内容

### 2.3 agentRunner.ts (449行)

**核心函数**: `runAgent(options) -> AgentResult`

```
1. 解析 AgentDefinition (string或object)
2. 验证 API Key
3. 创建 Agent Instance (UUID, maxTurns, model)
4. 注册 AgentRunContext 到 activeAgents Map
5. filterToolsForAgent() 过滤工具集合
6. 构建 Agent System Prompt
7. 创建消息列表 (parent + task)
8. Agent 循环 (turnCount < maxTurns):
   a. needsCompaction() -> compactMessages()
   b. streamClaudeAPI() 获取响应
   c. 累积 text 到 contentOutput
   d. 如 tool_uses: 权限检查+工具执行+追加结果
   e. 无 tool_uses -> break
9. 清理 activeAgents
10. 返回 AgentResult
```

**过滤算法** (filterToolsForAgent):
- tools = ["*"] -> 全部工具
- tools = ["*"] + disallowedTools -> 排除
- tools 非空列表 -> 精确匹配
- disallowedTools only -> 排除
- Default: 全部工具

**模块级上下文追踪**:
- activeAgents: Map<string, AgentRunContext>
- getCurrentAgentContext(): 返回最后注册的上下文
- getAgentContext(agentId): 按ID查询

### 2.4 builtInAgents.ts (228行)

6个内置Agent的系统提示词特点:

| Agent | 工具配置 | 特点 |
|-------|---------|------|
| general-purpose | tools: ["*"] | 多用途研究+实现 |
| Explore | disallowedTools: [Write,Edit] | 只读搜索专家 |
| Plan | disallowedTools: [Write,Edit] | 只读规划专家 |
| Verify | disallowedTools: [Write,Edit] | 代码审查5维度 |
| coordinator | tools: ["*"] | 协调整合任务+委派worker |
| worker | tools: ["*"] | 独立执行子任务 |

### 2.5 teamManager.ts (227行)

| 操作 | 函数 | 持久化 |
|------|------|:------:|
| 创建 | createTeam(name, desc?, leadType?) | ✅ JSON |
| 删除 | deleteTeam(name) | ✅ 删除文件 |
| 添加成员 | addTeamMember(team, name, type, role) | ✅ |
| 移除成员 | removeTeamMember(team, memberId) | ✅ |
| 状态更新 | updateMemberStatus(team, memberId, active) | ✅ |
| 查询 | getTeam, getAllTeams, getTeamMembers | 读JSON |

**持久化路径**: `~/.claude-code-mini/teams/{name}.json`

---

## 3. API 层详细设计

### 3.1 services/api/claude.ts (130行)

**Provider 路由**:
```
streamClaudeAPI(params):
  if isOpenAIProvider():
    -> openAIStream = streamOpenAIAPI(...)
    -> yield* openAIToAnthropicStream(openAIStream)
  else (Anthropic):
    -> client = new Anthropic({apiKey, baseURL})
    -> stream = await client.beta.messages.create({stream: true})
    -> for await event of stream: yield event
```

**关键参数**:
- max_tokens: 32000 (默认)
- betas: 通过constants/betas.ts管理
- system: 独立参数 (非消息数组)

### 3.2 OpenAI 兼容层 (services/api/openai/)

- **client.ts**: OpenAI Chat Completions SSE流式调用
- **streamAdapter.ts**: OpenAI事件 -> Anthropic流格式映射
- **modelMap.ts**: Claude模型名 -> OpenAI模型名映射

---

## 4. 工具系统详细设计

### 4.1 注册表 (tools/tools.ts, 72行)

```typescript
getTools(): Tool[]  // 18内置 + 动态MCP工具
getToolsMap(): Map<string, Tool>  // O(1)查找
registerMCPTools(entries: MCPEntry[]): void  // MCP工具包装注册
```

### 4.2 核心工具实现要点

| 工具 | 行数 | 关键实现 |
|------|:---:|------|
| BashTool | 54 | execFileNoThrow, 120s超时, win32/unix shell自动选择 |
| FileReadTool | 60 | offset/limit分页, 文件不存在error |
| FileWriteTool | 52 | 递归创建目录, 覆盖写入 |
| FileEditTool | 90 | old_string唯一匹配替换 |
| ApplyPatchTool | 180 | unified diff解析, patch验证 |
| GlobTool | 110 | Bun.Glob匹配, 最多100条 |
| GrepTool | 100 | 正则搜索, -i/-n选项 |
| WebFetchTool | 180 | fetch + HTML提取, 截断10K |
| WebSearchTool | 140 | 搜索API, 标题+URL+摘要 |
| AgentTool | 130 | Registry查找+runAgent调用+usage报告 |
| TaskCreateTool | 55 | taskStore.createTask |
| TaskListTool | 40 | taskStore.listTasks+格式化 |
| TaskUpdateTool | 75 | taskStore.updateTask |
| SkillTool | 70 | 按名称查找并调用Skill |
| EnterPlanModeTool | 28 | planMode.enterPlanMode() |
| ExitPlanModeTool | 28 | planMode.leavePlanMode()+addPlanResult |
| TeamCreateTool | 90 | teamManager.createTeam() |
| TeamDeleteTool | 80 | teamManager.deleteTeam() |
| MCPTool | 45 | createMCPToolWrapper 工厂 |

---

## 5. 记忆系统详细设计

### 5.1 本地记忆 (memoryStore.ts, 225行)

**数据结构**:
```json
{
  "version": 1,
  "memories": [{
    "id": "mem_1234567890",
    "content": "...",
    "tags": ["typescript", "testing"],
    "category": "best-practice",
    "createdAt": "2026-05-14T...",
    "updatedAt": "2026-05-14T..."
  }]
}
```

**CRUD**: addMemory, getMemories({category,tags,limit}), getMemoryById, updateMemory, deleteMemory
**工具**: searchMemories(query), getAllTags(), getAllCategories(), exportMemories(format), importMemories(data)
**注入**: formatMemoriesForPrompt() -> 系统提示词

### 5.2 会话记忆 (sessionMemory.ts, 357行)

**配置**: enabled/false, minTokensForInit/2000, minTokensBetweenUpdate/1000, maxNotes/30

**提取**:
1. estimateTotalTokens(messages) — 字符数/4
2. shouldExtractMemory(messages)
3. extractSessionNotes(messages): 用户请求 + AI决策(regex) + 文件路径(regex)
4. persistSessionMemory(notes): merge去重 -> groupBy分类 -> write .md

### 5.3 云端 Memory Stores (memoryStoresClient.ts, 155行)

API: listStores, createStore, getStore, archiveStore, listMemories, createMemory, updateMemory, deleteMemory, listVersions, redactVersion

### 5.4 团队记忆同步 (teamMemorySync.ts, 260行)

- Delta Upload: 按SHA256校验和比对，仅上传变更
- 双向同步: pull + push
- 本地存储: `team-memory/*.md`

---

## 6. 插件系统详细设计

### 扫描目录
```
user:    ~/.claude-code-mini/plugins/
project: {cwd}/.codex/plugins/
bundled: {appRoot}/plugins/bundled/
```

### Manifest: `.codex-plugin/plugin.json`
### 安装: spec解析 -> marketplace获取 -> 下载tarball -> 解压 -> 验证

### Marketplace
- 默认: `https://api.anthropic.com/v1/marketplace/claude-plugins-official`
- 缓存: `~/.claude-code-mini/marketplaces/cache/{name}.json`
- 搜索: searchMarketplacePlugins(marketplace, query)

---

## 7. MCP 客户端详细设计

### MCPConnection 类
- spawn 子进程 (stdio: pipe)
- JSON-RPC 2.0 协议
- pending Map<id, {resolve,reject}>
- 缓冲区按行解析JSON

### 协议序列
```
1. initialize({protocolVersion, capabilities, clientInfo})
2. notifications/initialized
3. tools/list -> 获取工具
4. tools/call -> 执行工具
```

### MCPToolWrapper
- name: `mcp__{server}__{tool}`
- execute: connection.callTool(name, args)
- 结果转换: MCPToolResult -> ToolResult

---

## 8. 配置管理详细设计

### configManager.ts (68行)

**AppConfig**:
```typescript
{
  model?: string
  maxTurns?: number
  permissionMode?: "default"|"acceptEdits"|"bypassPermissions"
  theme?: "dark"|"light"
  autoCompact?: boolean
}
```

**操作**: loadConfig (缓存), saveConfig, updateConfig (合并), setConfigDir (测试)

**路径**: `~/.claude-code-mini/config.json`

---

## 9. 上下文构建详细设计

### context.ts (400行)

**组件**: 日期, 工作目录, Git状态, ClaudeMd, Skills, Memories, Agents, Teams
**开关**: ContextConfig 控制各组件是否包含
**输出**: EnhancedContext { fullContext, parts, gitStatus, timestamp }

---

## 10. Utils 层

| 模块 | 导出 | 用途 |
|------|------|------|
| auth.ts | getAPIKey, getAnthropicBaseURL | API认证配置 |
| claudemd.ts | loadClaudeMdFiles | 项目CLAUDE.md加载 |
| git.ts | getGitStatus | Git仓库状态检测 |
| log.ts | logError, logDebug, logInfo | 分级日志 |
| model/model.ts | resolveModel | 模型名称解析 |
| model/providers.ts | isOpenAIProvider | Provider检测 |
| settings/settings.ts | getPermissionMode, getSettings | 设置管理 |
| execFileNoThrow.ts | execFileNoThrow | 安全命令执行 |
| tokens.ts | estimateTokens | Token数估算 |
| abortController.ts | createAbortController | 取消控制 |