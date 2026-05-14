# Claude Code Mini v8 - ??????

> ??: 8.0.0 | ??: 2026-05-14

---

## 1. ???? (entrypoints/cli.ts)

### ??: src/entrypoints/cli.ts (646?)

**??**: CLI ?? + REPL ?? + ?????

**???**: `main()`

**????**:

```
main():
  1. ?? MACRO ?? (VERSION, BUILD_TIME)
  2. resetTasks() ??????
  3. ?? API Key
  4. loadConfig() ????
  5. loadAllPlugins() ????
  6. initAgentRegistry() ??? Agent ????
  7. initSession() ???????
  8. connectMCPServers() + registerMCPTools() ?? MCP
  9. ????:
     - Pipe/Args: runHeadless(prompt)
     - TTY: runREPL()
```

**runHeadless(prompt)**:
- ?? 1 ? user message
- ?? processConversation ??
- ???????

**runREPL()**:
- ?????? (Agents/Memory/MCP ??)
- readline ??????
- ?? / ???? -> ??? Commands
- ???? -> processConversation ??
- Ctrl+C/D ??

**processConversation(messages)**:
```
while true:
  1. needsCompaction? -> compactMessages()
  2. streamClaudeAPI() -> ????
     - text_delta -> ??? fullText
     - content_block_start(tool_use) -> ?? tool use
     - input_json_delta -> ?? JSON
  3. ?? fullText
  4. ?? tool_uses:
     for each toolUse:
       - ???? (requestPermission)
       - ?? ToolUseContext
       - tool.execute()
       - ?? tool_result
     - ??? messages
  5. ? tool_uses -> break
  6. shouldExtractMemory? -> ????
```

---

## 2. Agent ??????

### 2.1 agentTypes.ts (228?)

**????**:

| ?? | ?? | ?? |
|------|------|------|
| AgentSource | "built-in"\|"user"\|"project"\|"plugin"\|"local" | Agent ?? |
| AgentDefinition | agentType, whenToUse, tools, disallowedTools, skills, getSystemPrompt, model, maxTurns, source, color, background, initialPrompt | Agent ?? |
| AgentInstance | id, definition, status, task, result[], error, turnCount, totalInputTokens, totalOutputTokens | ???? |
| AgentStatus | "idle"\|"running"\|"completed"\|"failed"\|"cancelled" | ??? |
| TeamDefinition | name, description, leadAgentId, leadSessionId, members[] | ???? |
| TeamMember | agentId, name, agentType, role, model, joinedAt, cwd, isActive | ???? |
| AgentRole | "lead"\|"worker"\|"coordinator" | ???? |
| AgentRunContext | agentId, parentSessionId, agentType, teamName, isTeamLead, startTime | ????? |
| AgentResult | agentId, status, content[], totalTokens, totalToolUseCount, totalDurationMs, error | ???? |

### 2.2 agentRegistry.ts (245?)

**????**: `Map<string, AgentDefinition>`

**????**:

| ?? | ?? | ?? |
|------|------|------|
| initAgentRegistry | (cwd, plugins[]) -> void | ???: ??+??+??+?? |
| registerAgent | (agent) -> void | ??????: plugin > project > user > built-in |
| unregisterAgent | (agentType) -> boolean | ?? |
| getAgent | (agentType) -> AgentDefinition? | ?? |
| getAllAgents | () -> AgentDefinition[] | ?? |
| searchAgents | (query) -> AgentDefinition[] | ?? |
| getAgentsForPrompt | () -> string | ????????? |
| resetAgentRegistry | () -> void | ?? (???) |

**Agent Markdown ??** (parseAgentMarkdownFile):
- Frontmatter ??: YAML-like (key: value)
- ????: agentType, whenToUse, description, tools, disallowedTools, skills, model, maxTurns, permissionMode, color, background, initialPrompt
- Body ???? System Prompt

### 2.3 agentRunner.ts (449?)

**????**: `runAgent(options) -> AgentResult`

**????**:
```
1. ?? AgentDefinition (?? string ? object)
2. ?? API Key
3. ?? Agent Instance (UUID, maxTurns, model)
4. ?? AgentRunContext ? activeAgents Map
5. filterToolsForAgent() ????
6. ?? Agent System Prompt
7. ?????? (parentMessages + task)
8. Agent ?? (turnCount < maxTurns):
   a. needsCompaction() -> compactMessages()
   b. streamClaudeAPI() ????
   c. ?? text ? contentOutput
   d. ?? tool_uses:
      - ????
      - ?? ToolUseContext
      - tool.execute()
      - ?? tool_result ? messages
   e. ? tool_uses -> break
9. ?? activeAgents
10. ?? AgentResult
```

**????** (filterToolsForAgent):
```
- agent.tools = ["*"] && no disallowedTools -> all
- agent.tools = ["*"] && has disallowedTools -> exclude disallowed
- agent.tools non-empty -> exact match
- only disallowedTools -> exclude them
- default: all tools
```

**?????**:
```
activeAgents: Map<string, AgentRunContext>
getCurrentAgentContext(): ???????
getAgentContext(agentId): ? ID ??
```

### 2.4 builtInAgents.ts (228?)

**6 ??? Agent**:

| Agent | System Prompt ?? | ???? |
|-------|-------------------|---------|
| general-purpose | ?????+?? | tools: ["*"] |
| Explore | ???????????/???? | disallowedTools: [Write,Edit,NotebookEdit] |
| Plan | ?????????????? | disallowedTools: [Write,Edit,NotebookEdit] |
| Verify | ?????5???? | disallowedTools: [Write,Edit,NotebookEdit] |
| coordinator | ???????????worker | tools: ["*"] |
| worker | ???????????? | tools: ["*"] |

### 2.5 teamManager.ts (227?)

**??????**:

| ?? | ?? | ??? |
|------|------|:------:|
| ?? | createTeam(name, desc?, leadType?) | writeTeamFile |
| ?? | deleteTeam(name) -> {success,message} | deleteTeamFile |
| ???? | addTeamMember(team, name, type, role) | writeTeamFile |
| ???? | removeTeamMember(team, memberId) | writeTeamFile |
| ???? | updateMemberStatus(team, memberId, active) | writeTeamFile |
| ?? | getTeam(name), getAllTeams(), getTeamMembers(name) | readTeamFile |

**?????**: `~/.claude-code-mini/teams/{name}.json`

---

## 3. API ?????

### 3.1 services/api/claude.ts (130?)

**Provider ????**:
```
streamClaudeAPI(params):
  if isOpenAIProvider():
    -> config = getOpenAIConfig()
    -> model = resolveOpenAIModel(params.model)
    -> stream = streamOpenAIAPI(...)
    -> yield* openAIToAnthropicStream(stream)
  else:
    -> client = new Anthropic({apiKey, baseURL})
    -> stream = client.beta.messages.create({stream:true})
    -> yield* stream events
```

**????**:
- max_tokens: 32000 (??)
- betas: computer-use-2025-01-27, long-output, token-efficient-tools-2025-05-06 ?
- system: ?? system prompt (?????)
- tools: ??? API ?? (name, description, input_schema)

### 3.2 services/api/openai/

**client.ts**: OpenAI Chat Completions ??
- ????: OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
- ????: fetch + SSE ??
- ????: Anthropic Tool -> OpenAI function

**streamAdapter.ts**: OpenAI -> Anthropic ??????
- text delta -> content_block_delta
- tool_calls -> content_block_start (tool_use)
- function.arguments -> input_json_delta

**modelMap.ts**: ??????
- claude-sonnet-4-20250514 -> gpt-4o (??)

---

## 4. ????????

### 4.1 ????? (tools/tools.ts)

```typescript
// ??????
function getTools(): Tool[] {
  return [
    BashTool, FileReadTool, FileWriteTool, FileEditTool,
    GrepTool, GlobTool, WebFetchTool, WebSearchTool,
    TaskCreateTool, TaskUpdateTool, TaskListTool,
    ApplyPatchTool, SkillTool,
    EnterPlanModeTool, ExitPlanModeTool,
    AgentTool, TeamCreateTool, TeamDeleteTool,
    ...mcpTools  // ????? MCP ??
  ]
}

function getToolsMap(): Tools {
  // Map<string, Tool> ?? O(1) ??
}

function registerMCPTools(entries: MCPEntry[]): void {
  // ?? MCP ??? Tool ??
}
```

### 4.2 ??????

**BashTool** (54?):
- ???? shell (win32: cmd.exe, else: /bin/bash)
- execFileNoThrow ??
- 120s ??
- ??: exit code + stdout + stderr

**FileReadTool** (60?):
- ?? offset/limit ??
- ??????? error
- ?????

**FileWriteTool** (52?):
- ???? (??)
- ????
- ??????

**FileEditTool** (90?):
- ????
- ?? old_string (????)
- ??? new_string
- ??????

**GlobTool** (110?):
- ?? Bun.Glob ????
- ???? 100 ?

**GrepTool** (100?):
- ????
- ?? -i (?????), -n (??)
- ???? 100 ?

**WebFetchTool** (180?):
- fetch URL
- ?? text/html ??
- ??? 10000 ??

**WebSearchTool** (140?):
- ?? API ??
- ????+URL+??

**AgentTool** (130?):
- ?? agent type ??
- ?? runAgent()
- ???? + usage ??

**TaskCreateTool** (55?):
- createTask(title, description)
- ?? task id

**TaskListTool** (40?):
- listTasks()
- ?????

**TaskUpdateTool** (75?):
- updateTask(id, {status, result})
- ????? task

---

## 5. ????????

### 5.1 ???? (memoryStore.ts, 225?)

**??**: `~/.claude-code-mini/memories-v2.json`

**??**:
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

**CRUD ??**:
- addMemory(content, tags[], category)
- getMemories({category?, tags?, limit?})
- getMemoryById(id)
- updateMemory(id, updates)
- deleteMemory(id)
- searchMemories(query) ? ????

**????**:
- getAllTags(), getAllCategories()
- exportMemories(format) ? JSON/Markdown
- importMemories(data)
- formatMemoriesForPrompt() ? ?????

### 5.2 ???? (sessionMemory.ts, 357?)

**??**: `~/.claude-code-mini/session-memory/{id}.md`

**??**:
```typescript
{
  enabled: false,
  minTokensForInit: 2000,
  minTokensBetweenUpdate: 1000,
  maxNotes: 30
}
```

**????**:
1. estimateTotalTokens(messages) ? chars/4
2. shouldExtractMemory(messages) ? ????
3. extractSessionNotes(messages):
   - extractUserMessages: filter role="user"
   - extractAssistantDecisions: regex patterns
   - extractFilePaths: regex patterns
4. persistSessionMemory(notes):
   - mergeNotes (??)
   - groupBy category
   - write markdown file

### 5.3 ?? Memory Stores (memoryStoresClient.ts, 155?)

**API ??**: `https://api.anthropic.com/v1/memory_stores`

**??**:
- listStores() / createStore(name, ns) / getStore(id) / archiveStore(id)
- listMemories(storeId) / createMemory(storeId, content)
- getMemory(storeId, memId) / updateMemory(storeId, memId, content) / deleteMemory(...)
- listVersions(storeId) / redactVersion(storeId, versionId)

### 5.4 ?????? (teamMemorySync.ts, 260?)

**????**: `~/.claude-code-mini/team-memory/*.md`

**????**:
```
pullTeamMemory(state):
  GET /api/.../team_memory?repo=owner/repo
  for each entry: writeTeamMemory(key, content)
  update state.serverChecksums

pushTeamMemory(state):
  local = scanLocalTeamMemories()
  delta = entries where checksum != serverChecksum
  PUT with delta entries
  update state.serverChecksums
```

---

## 6. ????????

### 6.1 ????

**????**:
```
Plugin Scope    | ??
---------------|------
user           | ~/.claude-code-mini/plugins/
project        | {cwd}/.codex/plugins/
bundled        | {appRoot}/plugins/bundled/
```

**manifest ??**: `.codex-plugin/plugin.json`

### 6.2 ????

**????**:
1. ?? spec (name@marketplace)
2. ? marketplace ???? URL
3. ?? tarball
4. ????? scope ??
5. ?? manifest

### 6.3 Marketplace

**?? Marketplace**: `https://api.anthropic.com/v1/marketplace/claude-plugins-official`

**????**:
- ?? fetch ???? `~/.claude-code-mini/marketplaces/cache/{name}.json`
- ??????????

---

## 7. MCP ???????

### 7.1 ????

**? MCPConnection**:
- spawn ??? (stdio: pipe)
- JSON-RPC 2.0 ??
- ??/??: pending Map<id, {resolve, reject}>
- ?????: ???? JSON

**????**:
```
1. initialize({protocolVersion, capabilities, clientInfo})
2. ?? initialized ??
3. tools/list -> ??????
4. tools/call -> ????
```

### 7.2 MCP ????

**createMCPToolWrapper(entry, mcpTool) -> Tool**:
- name: `mcp__{serverName}__{toolName}`
- execute: ?? connection.callTool(name, args)
- ????: MCPToolResult -> ToolResult

---

## 8. ????????

### configManager.ts (68?)

**????**:
```typescript
interface AppConfig {
  model?: string
  maxTurns?: number
  permissionMode?: "default"|"acceptEdits"|"bypassPermissions"
  theme?: "dark"|"light"
  autoCompact?: boolean
}
```

**??**:
- loadConfig(): ? `~/.claude-code-mini/config.json` ??????
- saveConfig(config): ???? + ????
- updateConfig(updates): ?????
- setConfigDir(dir): ???????

---

## 9. ?????????

### context.ts (400?)

**?????**:

| ?? | ?? | ?? |
|------|------|------|
| ???? | new Date() | includeDate |
| ???? | getCwd() | includeWorkingDirectory |
| Git ?? | utils/git.ts | includeGit |
| ClaudeMd | utils/claudemd.ts | includeClaudeMd |
| Skills | services/skill/skillLoader.ts | includeSkills |
| Memories | services/memory/memoryStore.ts | includeMemories |
| Agents | agents/agentRegistry.ts | includeAgents |
| Teams | agents/teamManager.ts | includeTeams |

**????**:
```typescript
async function getSystemContext(config?): Promise<string>
async function getUserContext(config?): Promise<string>
```

---

## 10. ?????????

### utils/ ????

| ?? | ?? | ?? |
|------|------|------|
| auth.ts | getAPIKey(), getAnthropicBaseURL() | API ?? |
| claudemd.ts | loadClaudeMdFiles() | ?????? |
| git.ts | getGitStatus() | Git ???? |
| log.ts | logError(), logDebug(), logInfo() | ???? |
| messages.ts | extractUserMessages(), extractText() | ???? |
| model/model.ts | resolveModel() | ?????? |
| model/providers.ts | isOpenAIProvider() | Provider ?? |
| settings/settings.ts | getPermissionMode(), getSettings() | ???? |
| execFileNoThrow.ts | execFileNoThrow() | ?????? |
| abortController.ts | createAbortController() | ???? |
| tokens.ts | estimateTokens() | Token ?? |
