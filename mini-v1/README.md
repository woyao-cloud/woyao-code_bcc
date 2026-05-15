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


v8 版本
- 新增 git

## ✅ Phase 2 完成！
已成功完成 Git 功能增强的迁移！以下是完成的工作：

### 📦 修改的文件
1. mini-v8/src/utils/git.ts - 大幅增强
   
   - 远程仓库信息 ：
     
     - getRemoteUrl() - 获取 origin 远程 URL
     - normalizeRemoteUrl() - 规范化 URL（移除 .git 后缀、SSH 转 HTTPS、小写转换）
     - hashRemoteUrl() - 生成匿名化的 URL 哈希
     - getRemoteNames() / getRemoteUrls() / getRemoteUrlFor() - 多远程仓库支持
   - 工作区状态 ：
     
     - getGitRoot() - 获取仓库根目录
     - isWorkingTreeClean() - 检查工作区是否干净
     - getStatus() - 获取 porcelain 格式状态
     - hasStagedChanges() / hasUnstagedChanges() / hasUntrackedFiles() - 变更检测
   - 文件信息 ：
     
     - getTrackedFiles() / getUntrackedFiles() / getModifiedFiles() / getStagedFiles() - 文件列表
   - 提交信息 ：
     
     - getCommitHash() - 获取提交哈希（支持短哈希）
     - getAheadCount() / getBehindCount() - 与远程的提交差距
     - hasUnpushedCommits() - 检测未推送提交
   - 综合状态 ：
     
     - GitStatus 接口 - 完整的仓库状态类型
     - getGitStatus() - 一次性获取所有仓库信息
2. mini-v8/src/context.ts - 集成增强的 Git 状态
   
   - 更新 getSystemContext() 使用新的 getGitStatus()
   - 新增 getGitContext() - 返回详细的 Git 上下文字符串
   - 新增 getGitStatusObject() - 返回结构化的 Git 状态对象
3. mini-v8/src/__tests__/git.test.ts - 新增测试
   
   - 测试 URL 规范化和哈希功能
   - 验证 GitStatus 接口结构
### ✨ 新增功能 Git 工具增强
- ✅ 远程 URL 获取和规范化
- ✅ URL 匿名化哈希（用于日志和追踪）
- ✅ 多远程仓库支持
- ✅ 工作区状态检测（暂存/未暂存/未追踪文件）
- ✅ 文件列表查询
- ✅ 提交差距检测（ahead/behind）
- ✅ 综合状态查询 Context 系统增强
- ✅ 在系统上下文中显示更详细的 Git 信息
- ✅ 支持获取结构化的 Git 状态对象
### 🧪 测试结果
- 348 个测试，全部通过！ ✅
- Git 测试：10 个用例
- 修复了变量名冲突问题