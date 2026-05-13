# Claude Code Mini v8 - Multi-Agent Coordination

## What's New in v8

v8 builds on v7 (Memory System) by adding a full **Multi-Agent Coordination** layer:

### Agent System
- **6 built-in agents**: Explore, Plan, General-Purpose, Verify, Coordinator, Worker
- **Agent Registry**: Auto-discovers agents from built-in, user (`~/.claude/agents/`), project (`.claude/agents/`), and plugin sources
- **Agent Runner**: In-process subagent execution with isolated context, tool filtering, turn limiting, and result aggregation
- **Tool filtering**: Agents can have allowed/disallowed tool lists (e.g., Explore is read-only)

### Team Management
- **TeamCreate/TeamDelete**: Form and disband multi-agent teams
- **Member management**: Add/remove members, toggle active status
- **Role system**: Lead, Worker, Coordinator roles
- **Persistence**: Teams saved to disk for cross-session continuity

### Swarm Coordination
- **Coordinator agent**: Delegates to worker subagents for parallel execution
- **Swarm commands**: `/swarm start|stop|status`
- **Team context**: Shared context for coordinated multi-agent work

### New CLI Commands
```
/agent list|info|run|create|delete|stop
/team create|delete|list|members|add
/swarm start|stop|status
```

### New Tools
- **Agent**: Spawn subagents for complex tasks
- **TeamCreate**: Create multi-agent swarm teams
- **TeamDelete**: Disband teams

## Architecture

```
src/
  agents/
    agentTypes.ts          - Type definitions (AgentDefinition, Team, etc.)
    builtInAgents.ts       - 6 built-in agent definitions
    agentRegistry.ts       - Agent discovery & registration
    agentRunner.ts         - In-process subagent execution
    teamManager.ts         - Team lifecycle management
    index.ts               - Public API exports
  tools/builtin/
    AgentTool/AgentTool.ts           - Agent tool wrapper
    TeamCreateTool/TeamCreateTool.ts - Team creation tool
    TeamDeleteTool/TeamDeleteTool.ts - Team deletion tool
  commands/
    agentCommands.ts       - /agent, /team, /swarm commands
```

## Usage

```bash
# Run with pipe
cat prompt.txt | bun run src/entrypoints/cli.ts

# Interactive REPL
bun run dev

# Type check
bun run typecheck

# Run tests
bun test
```

## Version History

| Version | Features |
|---------|----------|
| v5 | Base CLI: tools, API, REPL |
| v6 | Plugin/Skill ecosystem |
| v7 | Memory system: SessionMemory, Memory Stores, Team Sync |
| v8 | Multi-Agent Coordination: AgentTool, Teams, Coordinator, Swarm |


### 新增内容

  Agent 系统 (src/agents/)

  - agentTypes.ts — 完整类型定义：AgentDefinition、AgentInstance、TeamDefinition、TeamMember、AgentRunContext、AgentResult
  - builtInAgents.ts — 6 个内置 Agent：Explore（只读搜索）、Plan（只读规划）、General-Purpose（全工具）、Verify（代码审查）、Coordinator（委派协调）、Worker（执行器）
  - agentRegistry.ts — Agent 注册中心，自动发现 built-in / ~/.claude/agents/ / .claude/agents/ / 插件来源的 Agent
  - agentRunner.ts — 进程内子 Agent 执行引擎，支持工具过滤、轮次限制、结果聚合
  - teamManager.ts — 团队生命周期管理：创建/解散、成员增删、状态切换、持久化到磁盘

  3 个新工具

  - AgentTool — 生成子 Agent 处理复杂任务
  - TeamCreateTool — 创建多 Agent Swarm 团队
  - TeamDeleteTool — 解散团队

  CLI 命令 (/agent, /team, /swarm)

  - /agent list|info|run|create|delete|stop
  - /team create|delete|list|members|add
  - /swarm start|stop|status

  ### 验证结果

  - bun run typecheck — 零错误
  - bun test — 298 pass / 1 fail（预存在的 teamMemorySync 测试，mini-v7 中也失败）
