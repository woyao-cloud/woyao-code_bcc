╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Task & Planning Upgrade: mini-v9 → full src/ capabilities

 Context

 mini-v9 already has a solid foundation of task/plan/agent tools from previous work. The 
 full src/ has additional depth in plan mode V2, workflow execution, agent isolation, 
 and the GSD structured development workflow.

 This plan targets incremental enhancements to bring mini-v9's task decomposition and 
 planning capabilities to parity with the full src/, building on the existing 
 infrastructure rather than rewriting it.

 Current state: mini-v9 already has 39 tools including TaskCreate/Update/List/Get/Stop,
 EnterPlanMode/ExitPlanMode/VerifyPlanExecution, Agent tool, TeamCreate/TeamDelete, 
 6 built-in agents, plan store with 5-phase workflow, task store with disk persistence,
 notification queue, and tool orchestration with concurrent execution.

 Key decisions:
 - No new packages — all changes in mini-v9/src/ 
 - Reuse existing patterns (simple types + functions, no classes where possible)
 - Each phase independently deployable and testable

 ---
 Phase 1: Plan Mode V2 — Interview + Deeper Workflow

 Goal: Enhance the 5-phase plan mode with interview phase, better agent orchestration,
 and phase-specific context injection.

 Files to create:
 - src/services/planModeV2.ts — Enhanced plan mode with:
   - Interview phase (Phase 0): AskUserQuestion to clarify requirements before exploring
   - Configurable agent counts (exploreAgentCount, planAgentCount)
   - Phase transition hooks (onPhaseEnter, onPhaseExit)
   - Per-agent plan file support (different agents can have different plan files)
   - Plan mode summary for cross-session continuity

 Files to modify:
 - src/services/planMode.ts — Delegate to planModeV2 for enhanced features, keep backward compat
 - src/tools/builtin/EnterPlanModeTool/EnterPlanModeTool.ts — Support interview phase flag
 - src/tools/builtin/ExitPlanModeTool/ExitPlanModeTool.ts — Support approval flow
 - src/entrypoints/cli.ts — Initialize planModeV2 on startup

 Dependencies: None (uses existing planStore.ts)

 Verification:
 - Enter plan mode → interview phase asks clarifying questions → proceeds to explore
 - Phase transitions work correctly
 - Plan recovery across sessions works with V2 state
 - bun test passes

 ---
 Phase 2: Workflow Tool — Structured Multi-Step Execution

 Goal: Add WorkflowTool for structured execution with phases, steps, state tracking,
 progress reporting. Enables the model to define and execute multi-phase workflows.

 Files to create:
 - src/tools/builtin/WorkflowTool/WorkflowTool.ts — Workflow execution tool:
   - create workflow with phases + steps
   - update step status
   - report progress
   - list running/completed workflows
   - Disk-persisted workflow state
 - src/tools/builtin/WorkflowTool/types.ts — Workflow types
 - src/services/workflowStore.ts — Workflow persistence (JSON files)

 Files to modify:
 - src/tools/tools.ts — Register WorkflowTool

 Dependencies: Uses taskStore patterns, planStore conventions.

 Verification:
 - Create workflow with 3 phases → execute steps → track progress → complete
 - Workflow persists across crashes
 - List all workflows filters by status
 - bun test passes

 ---
 Phase 3: Agent System Enhancements — Fork + Summarization + MCP

 Goal: Add fork subagent support (cache-efficient parallel agents), agent summarization
 for long runs, and per-agent MCP server definitions.

 Files to create:
 - src/agents/forkSubagent.ts — Fork subagent:
   - Shares parent's system prompt + tool pool for cache-identical API prefixes
   - Builds forked messages from conversation state
   - Supports isolation: "worktree" for safe experimentation
 - src/agents/agentSummarization.ts — Background agent summarization:
   - Periodic progress snapshots during long runs
   - Summary format for notification delivery

 Files to modify:
 - src/tools/builtin/AgentTool/AgentTool.ts — Add fork support, worktree isolation
 - src/agents/agentRunner.ts — Add summarization hooks during long loops
 - src/agents/agentTypes.ts — Add ForkConfig, WorktreeConfig types
 - src/agents/agentRegistry.ts — Support agent-level MCP server definitions

 Dependencies: Phase 1 planModeV2 for plan file isolation.

 Verification:
 - Fork agent runs in parallel with identical context prefix
 - Background agent produces summarization checkpoints
 - Agent with MCP definition connects servers on start, disconnects on end
 - bun test passes

 ---
 Phase 4: Missing Tools — Monitor + Memory Recall + Context Inspect

 Goal: Add MonitorTool for process/log watching, LocalMemoryRecallTool for session
 memory, and CtxInspectTool for context window awareness.

 Files to create:
 - src/tools/builtin/MonitorTool/MonitorTool.ts — Process/log monitoring:
   - Watch command output in real-time
   - Pattern matching (grep filters)
   - Timeout and persistent modes
   - Event streaming via notification queue
 - src/tools/builtin/LocalMemoryRecallTool/LocalMemoryRecallTool.ts — Memory recall:
   - Search past session transcripts
   - Query by date, project, keyword
   - Recall previous decisions and context
 - src/tools/builtin/CtxInspectTool/CtxInspectTool.ts — Context inspection:
   - Report current token usage
   - Show context window utilization
   - Identify largest messages

 Files to modify:
 - src/tools/tools.ts — Register all three new tools

 Dependencies: notificationQueue.ts for MonitorTool events.

 Verification:
 - MonitorTool watches a file/process and emits events
 - LocalMemoryRecallTool finds relevant past session data
 - CtxInspectTool reports accurate token counts
 - bun test passes

 ---
 Phase 5: Task System Deep Integration — Hooks + Mailbox + Swarm

 Goal: Add task lifecycle hooks, mailbox-based notifications, and swarm ownership patterns.

 Files to create:
 - src/services/taskHooks.ts — Task lifecycle hooks:
   - onTaskCreated: emit notification, update UI
   - onTaskCompleted: trigger verification nudge, spawn verify agent
   - onTaskBlocked: notify dependent task owners
 - src/services/mailbox.ts — Lightweight mailbox system:
   - Messages between agents
   - Plan approval requests
   - Status updates

 Files to modify:
 - src/services/taskStore.ts — Integrate hook calls on all state changes
 - src/tools/builtin/TaskUpdateTool/TaskUpdateTool.ts — Support hook integration
 - src/tools/builtin/TaskCreateTool/TaskCreateTool.ts — Support hook integration
 - src/agents/agentRunner.ts — Mailbox check before each turn

 Dependencies: None (self-contained).

 Verification:
 - Task creation fires onTaskCreated hook
 - 3 consecutive completions triggers verification nudge
 - Agent A sends message to Agent B via mailbox
 - bun test passes

 ---
 Phase 6: GSD Workflow — Structured Development Skills

 Goal: Port the GSD (Get Stuff Done) workflow as slash commands/skills. Integrates
 Plan Mode → Task Creation → Execution → Verification into a seamless flow.

 Files to create:
 - src/commands/gsd/start.ts — gsd:start — Initialize a project session
 - src/commands/gsd/plan.ts — gsd:plan — Create plan from requirements
 - src/commands/gsd/execute.ts — gsd:execute — Execute next task
 - src/commands/gsd/verify.ts — gsd:verify — Verify completed work
 - src/commands/gsd/index.ts — GSD command router

 Files to modify:
 - src/commands/index.ts — Register GSD commands
 - src/entrypoints/cli.ts — Wire GSD commands into command dispatch

 Dependencies: All previous phases. Plan mode (Phase 1), Tasks (Phase 5), Agents (Phase 3).

 Verification:
 - gsd:start initializes project session with plan file
 - Full flow: plan → task create → execute → verify
 - Session report generated at end
 - bun test passes

 ---
 Excluded (out of scope for "mini"):

 - Remote agent execution (CCR/teleport) — requires infrastructure
 - Teammate tmux-based spawning — requires tmux integration
 - Subscription-based feature gating — not relevant for mini
 - Full agent MCP support with custom server tool registries — scope too large
 - GSD skill port from harness (slash commands are harness-specific) — use command-based approach instead
 - SDK/task framework (src/utils/task/framework.ts) — too coupled to full harness

 ---
 Verification

 After each phase:
 1. bun test — all existing tests pass, no regressions
 2. bun run typecheck — no new type errors
 3. bun run dev — smoke test with simple planning query

 Full integration test:
 - Enter plan mode → interview → explore → design → write plan → exit (Phase 1)
 - Create workflow with phases → execute steps (Phase 2)
 - Fork agent for parallel research (Phase 3)
 - Monitor background process (Phase 4)
 - Task lifecycle with hooks and mailbox (Phase 5)
 - GSD workflow from start to verify (Phase 6)
