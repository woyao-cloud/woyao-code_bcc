// Core tools that are always loaded with full schema at initialization.
// All other tools are deferred and must be discovered via SearchExtraTools.

export const CORE_TOOLS: ReadonlySet<string> = new Set([
  // Shell
  'Bash',
  // File operations
  'Read',
  'Write',
  'Edit',
  // Search
  'Glob',
  'Grep',
  // Notebook
  'NotebookEdit',
  // Web
  'WebFetch',
  'WebSearch',
  // Agent
  'Agent',
  // Agent interaction
  'AskUserQuestion',
  // Task management
  'TaskCreate',
  'TaskUpdate',
  'TaskList',
  'TaskGet',
  'TaskOutput',
  'TaskStop',
  'TodoWrite',
  // Planning
  'EnterPlanMode',
  'ExitPlanMode',
  'VerifyPlanExecution',
  // Code intelligence
  'LSP',
  // Skills
  'Skill',
  // Scheduling
  'Sleep',
  // Tool discovery — MUST be core so the model can discover deferred tools
  'SearchExtraTools',
  'ExecuteExtraTool',
  'SyntheticOutput',
])
