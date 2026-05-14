# Claude Code Mini v8 - ??????

> ??: 8.0.0 | ??: 2026-05-14

---

## 1. ????

| ?? | ?? |
|------|------|
| ?? | ????????????? |
| ??? | ??/Skill/MCP ????? |
| ??? | Bun ???????????? Agent |
| ???? | TypeScript Strict Mode?? any |

---

## 2. ????

### 2.1 ?????

```
entrypoints/cli.ts
    |
    +---> context.ts
    |       |---> utils/claudemd.ts
    |       |---> utils/git.ts
    |       |---> services/skill/skillLoader.ts
    |       |---> services/memory/memoryStore.ts
    |       |---> agents/agentRegistry.ts
    |       |---> agents/teamManager.ts
    |
    +---> services/api/claude.ts
    |       |---> utils/auth.ts
    |       |---> utils/model/model.ts
    |       |---> utils/model/providers.ts
    |       |---> services/api/openai/client.ts
    |       |---> services/api/openai/streamAdapter.ts
    |       |---> services/api/openai/modelMap.ts
    |
    +---> tools/tools.ts
    |       |---> tools/builtin/* (19 tools)
    |       |---> services/mcp/mcpClient.ts
    |
    +---> services/permission/permissionManager.ts
    +---> services/compact/autoCompact.ts
    +---> services/retry.ts
    +---> commands/*
            |---> agents/agentRegistry.ts
            |---> agents/agentRunner.ts
            |---> agents/teamManager.ts
            |---> services/memory/*
            |---> plugins/*
            |---> services/skill/*
```

### 2.2 ????

| ?? | ?? | ?? | ?? |
|------|------|------|------|
| **entrypoints/cli.ts** | CLI??, REPL??, ????? | process.argv, stdin | stdout/stderr |
| **context.ts** | ??????? | CWD, Config | System Prompt ??? |
| **Tool.ts** | Tool ???? | - | Tool/Context/Result ?? |
| **agents/** | Agent ??/??/???? | Agent??, ?? | AgentResult |
| **commands/** | REPL ?????? | ???? | ???? |
| **services/api/** | API ?? (??/???) | QueryParams | StreamEvents |
| **services/compact/** | ?????? | messages[] | compacted messages[] |
| **services/config/** | ???? | - | AppConfig |
| **services/mcp/** | MCP ????? | ????? | MCP ???? |
| **services/memory/** | ????/??/?? | messages, ???? | ???? |
| **services/permission/** | ?????? | Tool?? | allow/deny |
| **services/skill/** | Skill ??/Store | ???, ?? | Skill?? |
| **plugins/** | ????/?? | ???? | LoadedPlugin[] |
| **tools/** | ????/?? | - | Tool[], ToolsMap |
| **types/** | ?????? | - | .d.ts |
| **utils/** | ?????? | ????? | ???? |

---

## 3. ????

### 3.1 Tool ??

```typescript
interface Tool {
  name: string
  description: string
  inputSchema: ToolInputSchema    // JSON Schema
  prompt: string                   // ????
  execute(ctx: ToolUseContext, input: Record<string,unknown>): Promise<ToolResult>
  canUse?(ctx: ToolUseContext, input: Record<string,unknown>): Promise<PermissionResult>
  userFacingName?(): string
}

interface ToolUseContext {
  toolUse: ToolUseBlockParam
  permissionMode: PermissionMode
  toolPermissionContext: ToolPermissionContext
  cwd: string
  abortSignal: AbortSignal
  messages: Message[]
  isInteractive: boolean
}

interface ToolResult {
  content: string      // ???API???
  rendered?: string    // ????
  success: boolean
  error?: string
  metadata?: Record<string,unknown>
}
```

### 3.2 API ??

```typescript
interface QueryParams {
  systemPrompt: string
  messages: BetaMessageParam[]
  tools: Tool[]
  model?: string
  signal?: AbortSignal
  maxTokens?: number
}

// ?? API
async function* streamClaudeAPI(
  params: QueryParams
): AsyncGenerator<BetaRawMessageStreamEvent>

// ??? API
async function callClaudeAPI(
  params: QueryParams
): Promise<Message>
```

### 3.3 Agent ??

```typescript
interface AgentDefinition {
  agentType: string
  whenToUse: string
  description?: string
  tools?: string[]          // ["*"] ????
  disallowedTools?: string[]
  skills?: string[]
  getSystemPrompt: () => string
  model?: string
  maxTurns?: number
  permissionMode?: string
  source: AgentSource       // built-in|user|project|plugin|local
  color?: string
  background?: boolean
  initialPrompt?: string
}

interface AgentResult {
  agentId: string
  status: AgentStatus       // idle|running|completed|failed|cancelled
  content: string[]
  totalTokens: number
  totalToolUseCount: number
  totalDurationMs: number
  error?: string
}
```

### 3.4 ????

```typescript
// ????
interface Memory {
  id: string
  content: string
  tags: string[]
  category: string
  createdAt: string
  updatedAt: string
}

// ????
interface SessionMemoryNote {
  id: string
  category: string          // user-request|decision|context
  content: string
  timestamp: string
}

// ????
interface TeamMemoryEntry {
  key: string
  content: string
  checksum: string          // sha256:...
}
```

### 3.5 ????

```typescript
interface PluginManifest {
  name: string
  version: string
  description: string
  commands?: PluginCommandDef[]
  skills?: PluginSkillDef[]
  mcpServers?: PluginMcpServerDef[]
  dependencies?: Record<string,string>
  minAppVersion?: string
}

interface LoadedPlugin {
  pluginId: string
  manifest: PluginManifest
  installPath: string
  marketplace: string
  scope: PluginScope
  enabled: boolean
  errors: PluginError[]
}
```

---

## 4. ????

### 4.1 ??????

```typescript
type Message = UserMessage | AssistantMessage | SystemMessage

interface UserMessage {
  role: "user"
  content: string | ContentItem[]
}

interface AssistantMessage {
  role: "assistant"
  content: string | ContentItem[]
}

type ContentItem =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string,unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
```

### 4.2 ????

```typescript
type PermissionMode = "default" | "acceptEdits" | "bypassPermissions"

interface ToolPermissionContext {
  mode: PermissionMode
  additionalWorkingDirectories: Map<string, string>
  alwaysAllowRules: Record<string, boolean>
  alwaysDenyRules: Record<string, boolean>
  isBypassPermissionsModeAvailable: boolean
}
```

### 4.3 ????

```typescript
type TaskStatus = "pending" | "in_progress" | "completed" | "failed"

interface Task {
  id: string                // task_N
  title: string
  description: string
  status: TaskStatus
  result?: string
  createdAt: string
  updatedAt: string
}
```

---

## 5. ????

### 5.1 Agent ??????

```
filterToolsForAgent(allTools, agentDef):
  1. ?? agent.tools == ["*"] ?? disallowedTools:
     -> ??????
  2. ?? agent.tools == ["*"] ?? disallowedTools:
     -> ???? disallowedTools ????
  3. ?? agent.tools ??:
     -> ????????
  4. ???? disallowedTools:
     -> ????????
  5. ????????
```

### 5.2 ??????

```
estimateTokens(messages):
  total = 0
  for msg in messages:
    total += len(serialize(msg.content)) / 4
  return total

needsCompaction(messages):
  return estimateTokens(messages) > 100000 * 0.7

compactMessages(messages, keepPairs=3):
  if len <= 6: return messages
  return [messages[0]] + messages[-6:]
```

### 5.3 ??????

```
extractSessionNotes(messages):
  notes = []
  // ????5?????
  userMsgs = filter(messages, role="user")[-5:]
  for each, add preview to notes
  // ??AI??
  patterns = [/I will/, /Let's/, /We should/, /The plan is/]
  for each assistant message, match patterns, add to notes
  // ??????
  pattern = file path regex
  for each message, extract unique paths, add to notes
  return deduplicated notes
```

### 5.4 ????????

```
pushTeamMemory(state):
  local = scanLocalTeamMemories()
  toUpload = []
  for entry in local:
    serverChecksum = state.serverChecksums.get(entry.key)
    if serverChecksum != entry.checksum:
      toUpload.push(entry)
  if toUpload.isEmpty: return
  send PUT request with toUpload
  update state.serverChecksums

pullTeamMemory(state):
  data = GET request
  for entry in data.entries:
    writeTeamMemory(entry.key, entry.content)
  update state.serverChecksums
```

---

## 6. ??????

| ?? | ?? | ?? |
|------|------|------|
| API ?? | ?????? (max 3?) | services/retry.ts |
| MCP ?? | ???????? (best-effort) | mcpClient.ts |
| ???? | catch ?? error ToolResult | ? Tool.execute() |
| ???? | try/catch + ?? false/null | tools/builtin/* |
| Agent ?? | catch ?? failed AgentResult | agentRunner.ts |
| ???? | ???? try/catch ?? | services/memory/* |
| ???? | ????? errors[] ?? | pluginLoader.ts |

---

## 7. ?????

| ??? | ?? | ?? |
|--------|------|------|
| ??? | ?? Tool ?? + ??? tools.ts | Tool interface |
| ? Agent | ?? .md ??? agents/ ?? | AgentDefinition |
| ? Provider | ?????? + ??? providers.ts | streamClaudeAPI pattern |
| ?? | .codex-plugin/plugin.json | PluginManifest |
| MCP ??? | mcp.json ?? | MCPServerConfig |
| Skill | SKILL.md ?? | Skill interface |
