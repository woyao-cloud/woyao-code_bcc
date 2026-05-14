# Claude Code Mini v8 - ??????

> ??: 8.0.0 | ??: 2026-05-14

---

## 1. ????

Claude Code Mini v8 ?????? AI ???? CLI ?????? Agent ????????????? MCP ????? Bun ???? TypeScript ????? Anthropic ? OpenAI API?

### ???

| ?? | ???? |
|------|---------|
| ??? | Bun (ESM) |
| ?? | TypeScript 5.7, Strict Mode |
| ???? | @anthropic-ai/sdk ^0.81.0 |
| ???? | bun:test |
| ???? | bun build |

---

## 2. ????

```
mini-v8/
  package.json
  tsconfig.json
  src/
    entrypoints/cli.ts          # ???? (CLI + REPL)
    Tool.ts                     # Tool ????
    context.ts                  # ?????
    agents/                     # ?Agent????
      agentTypes.ts             # ????
      agentRegistry.ts          # ????
      agentRunner.ts            # ????
      builtInAgents.ts          # 6???Agent
      teamManager.ts            # ????
      index.ts
    commands/                   # REPL??
      agentCommands.ts          # /agent /team /swarm
      memoryCommands.ts         # /memory
      pluginCommands.ts         # /plugin
      skillCommands.ts          # /skill
    services/                   # ?????
      api/claude.ts             # ??API (Anthropic+OpenAI)
      api/openai/               # OpenAI???
      compact/autoCompact.ts    # ????
      config/configManager.ts   # ????
      mcp/mcpClient.ts          # MCP???
      memory/                   # ????
        memoryStore.ts          # ????
        memoryStoresClient.ts   # ??API
        sessionMemory.ts        # ????
        teamMemorySync.ts       # ????
      permission/               # ????
      retry.ts                  # ????
      taskStore.ts              # ????
      planMode.ts               # Plan??
      skill/                    # Skill??
        skillLoader.ts
        skillStore.ts
    plugins/                    # ??????
      types.ts
      pluginLoader.ts
      pluginInstaller.ts
      marketplaceManager.ts
    tools/                      # ????
      tools.ts                  # ???
      builtin/                  # 19?????
        AgentTool/ BashTool/ FileEditTool/ FileReadTool/
        FileWriteTool/ GlobTool/ GrepTool/ MCPTool/
        SkillTool/ TaskCreateTool/ TaskListTool/ TaskUpdateTool/
        WebFetchTool/ WebSearchTool/
        ApplyPatchTool/ EnterPlanModeTool/ ExitPlanModeTool/
        TeamCreateTool/ TeamDeleteTool/
    types/                      # ????
    utils/                      # ???? (29??)
    constants/                  # ????
    bootstrap/state.ts          # ????
    __tests__/                  # 25???
  dist/cli.js                   # ????
```

---

## 3. ????

```
+---------------------------------------------------+
|                  Entry Layer                        |
|            entrypoints/cli.ts                       |
|  (????, REPL??, ?????)                     |
+----+----------------+------------------+-----------+
     |                |                  |
+----v-----+  +------v------+  +------v------+
| Agent ? |  |  Command ? |  |   Tool ?   |
| agents/  |  |  commands/  |  |   tools/    |
+----+-----+  +------+------+  +------+------+
     |                |                  |
+----v----------------v------------------v-----------+
|                Service Layer                        |
|  api/ | compact/ | config/ | mcp/ | memory/         |
|  permission/ | retry/ | task/ | plan/ | skill/     |
+----+----------------------------------+------------+
     |                                  |
+----v-----+                      +----v-----+
| Plugin ? |                     | Context ?|
| plugins/  |                     | context.ts|
+-----------+                     +-----------+
+---------------------------------------------------+
|              Foundation Layer                       |
|    types/ + utils/ + constants/ + bootstrap/       |
+---------------------------------------------------+
```

---

## 4. ????

### 4.1 REPL ????

```
User Input
    |
    v
cli.ts: ??????
    |
    +-- /xxx --> Commands? --> ??Service
    |
    +-- ????
        |
        v
    context.ts: ???????
        |-- Git Status
        |-- ClaudeMd
        |-- Skills
        |-- Memories
        |-- Agents & Teams
        |
        v
    services/api/claude.ts
        |-- Provider ??
        |-- ??API??
        |
        v
    Tool ????:
        |-- permissionManager
        |-- tool.execute()
        |-- ????API
        |
        v
    Auto-Compact (???)
    Memory Extraction (???)
```

### 4.2 Agent ???

```
AgentTool.execute()
    |
    v
agentRunner.ts: runAgent()
    |-- Registry ?? AgentDefinition
    |-- filterToolsForAgent
    |-- ???????
    |-- Agent ?? (maxTurns)
    |-- ?? AgentResult
```

---

## 5. ??????

1. **?????**: ?????? cli.ts ?????????????
2. **???Agent**: Agent ??????????????????????????
3. **?????**: ?? JS ?????????? (bootstrap/state.ts)
4. **??????**: Agent ???????? async/await ????????
5. **Provider ????**: ?? isOpenAIProvider() ????????????
