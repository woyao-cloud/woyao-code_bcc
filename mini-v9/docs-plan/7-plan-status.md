 调研结论

  好消息：mini-v9 已有非常坚实的基础。 核心工具都在：

  ┌────────────────────────────────────────────────┬────────────────────────────────────┐
  │                      能力                      │            mini-v9 状态            │
  │                      能力                      │            mini-v9 状态            │
  ├────────────────────────────────────────────────┼────────────────────────────────────┤
  │ TaskCreate/Update/List/Get/Stop                │ ✅ 已有，含依赖链、验证提示        │
  ├────────────────────────────────────────────────┼────────────────────────────────────┤
  │ EnterPlanMode/ExitPlanMode/VerifyPlanExecution │ ✅ 已有，5 阶段工作流 + 磁盘持久化 │
  ├────────────────────────────────────────────────┼────────────────────────────────────┤
  │ Agent 工具（子代理）                           │ ✅ 已有，同步+异步，6 个内置代理   │
  ├────────────────────────────────────────────────┼────────────────────────────────────┤
  │ TeamCreate/TeamDelete                          │ ✅ 已有，群组支持                  │
  ├────────────────────────────────────────────────┼────────────────────────────────────┤
  │ 工具编排（并发执行）                           │ ✅ 已有，槽位队列 + 级联取消       │
  └────────────────────────────────────────────────┴────────────────────────────────────┘

  差距主要在深度集成和高级模式：

  6 阶段追赶计划

  ┌───────┬──────────────────┬────────────────────────────────────────────────────┐
  │ Phase │       描述       │                      关键交付                      │
  ├───────┼──────────────────┼────────────────────────────────────────────────────┤
  │ 1     │ Plan Mode V2     │ 面试阶段、可配 agent 数量、阶段钩子                │
  ├───────┼──────────────────┼────────────────────────────────────────────────────┤
  │ 2     │ WorkflowTool     │ 结构化多阶段工作流执行                             │
  ├───────┼──────────────────┼────────────────────────────────────────────────────┤
  │ 3     │ Agent 增强       │ Fork 子代理、摘要、按 agent 配 MCP                 │
  ├───────┼──────────────────┼────────────────────────────────────────────────────┤
  │ 4     │ 缺失工具         │ MonitorTool、LocalMemoryRecallTool、CtxInspectTool │
  ├───────┼──────────────────┼────────────────────────────────────────────────────┤
  │ 5     │ 任务系统深度集成 │ 生命周期钩子、mailbox、swarm 所有权                │
  ├───────┼──────────────────┼────────────────────────────────────────────────────┤
  │ 6     │ GSD 工作流       │ 结构化的开发 slash commands                        │
  └───────┴──────────────────┴────────────────────────────────────────────────────┘
#

 Phase 2 (WorkflowTool) is fully implemented:

  - WorkflowTool.ts — Tool with 6 actions: create (define phases+steps), update (step status/result/assignee), update_status (workflow-level), list (with optional filter),
  get (full details), progress (formatted report)
  - tools.ts — Registered WorkflowTool in getAllBaseTools()
  - workflowStore.test.ts — 20 tests covering CRUD, auto-completion, progress, filtering, timestamps, assignee
  - toolsRegistry.test.ts — Updated tool count to 40 and added Workflow assertion

  All new tests pass. Ready for Phase 3-6 when you want to continue.

#
   Phase 3 complete. Here's what was implemented:

  New files:
  - src/agents/forkSubagent.ts — Fork subagent infrastructure: runForkedAgent() for cache-efficient parallel agents (shares parent system prompt prefix),
  createWorktreeIsolation() for safe filesystem experimentation, buildParentToolResultReplacements() for stable context replay
  - src/agents/agentSummarization.ts — Periodic agent progress summarization: buildAgentProgressSummary() for snapshots, shouldSummarize() at configurable intervals,
  formatSummaryForNotification() for delivery format

  Modified files:
  - src/agents/agentTypes.ts — Added ForkConfig, WorktreeConfig, IsolationMode types
  - src/agents/agentRunner.ts — Integrated summarization hooks in the core loop (periodic onProgress callbacks every 5 turns)
  - src/agents/agentRegistry.ts — Added getAgentMCPServers() and getAllAgentMCPServerNames() for agent-level MCP server resolution
  - src/agents/index.ts — Exports new modules
  - src/tools/builtin/AgentTool/AgentTool.ts — Added fork (boolean) and isolation (none/worktree) parameters, routes to runForkedAgent() when fork is enabled

  New tests:
  - agentSummarization.test.ts — 9 tests: summary generation, truncation, notification formatting, interval checking
  - forkSubagent.test.ts — 5 tests: worktree isolation creation, custom branches, config resolution