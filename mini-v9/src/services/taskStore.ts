/**
 * Task store for mini-v9.
 *
 * Two tiers:
 * 1. User-visible Tasks — persisted to disk (~/.claude-code-mini/tasks/),
 *    supports dependency chains (blocks/blockedBy), and a verification
 *    nudge after consecutive task completions.
 * 2. AgentTaskStore — transient in-memory tracking of async agent lifecycle.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { randomUUID } from 'crypto'
import type {
  AgentTaskState,
  AgentTaskStatus,
  AgentProgress,
  AgentResult,
  TaskId,
} from '../agents/agentTypes.js'
import { logDebug, logError } from '../utils/log.js'
import { enqueueNotification } from './notificationQueue.js'

// ============================================================
// Types
// ============================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  result?: string
  owner?: string
  blocks: string[] // task IDs that this task blocks
  blockedBy: string[] // task IDs that block this task
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

const TASKS_DIR = join(homedir(), '.claude-code-mini', 'tasks')
const VERIFICATION_NUDGE_THRESHOLD = 3

// ============================================================
// Disk persistence helpers
// ============================================================

function ensureTasksDir(): string {
  if (!existsSync(TASKS_DIR)) {
    mkdirSync(TASKS_DIR, { recursive: true })
  }
  return TASKS_DIR
}

function taskFilePath(id: string): string {
  return join(TASKS_DIR, `${id}.json`)
}

function writeTaskToDisk(task: Task): void {
  ensureTasksDir()
  try {
    writeFileSync(taskFilePath(task.id), JSON.stringify(task, null, 2), 'utf-8')
  } catch (err) {
    logError(`Failed to persist task ${task.id}: ${err}`)
  }
}

function deleteTaskFromDisk(id: string): void {
  try {
    const path = taskFilePath(id)
    if (existsSync(path)) unlinkSync(path)
  } catch (err) {
    logError(`Failed to delete task file ${id}: ${err}`)
  }
}

function loadAllTasksFromDisk(): Map<string, Task> {
  const tasks = new Map<string, Task>()
  if (!existsSync(TASKS_DIR)) return tasks

  try {
    const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        const raw = readFileSync(
          taskFilePath(file.replace(/\.json$/, '')),
          'utf-8',
        )
        const task = JSON.parse(raw) as Task
        tasks.set(task.id, task)
      } catch {
        // skip corrupt files
      }
    }
  } catch {
    // skip unreadable directory
  }

  return tasks
}

// ============================================================
// In-memory store with disk persistence
// ============================================================

let taskCounter = 0
let tasks = new Map<string, Task>()
let completedSinceLastVerification = 0

/**
 * Load persisted tasks from disk into memory.
 * Should be called once at startup.
 */
export function initializeTaskStore(): void {
  tasks = loadAllTasksFromDisk()
  // Recover counter from existing IDs
  let maxNum = 0
  for (const id of tasks.keys()) {
    const num = parseInt(id.replace('task_', ''), 10)
    if (!isNaN(num) && num > maxNum) maxNum = num
  }
  taskCounter = maxNum
  completedSinceLastVerification = 0
  logDebug(`Task store initialized: ${tasks.size} tasks loaded from disk`)
}

export function createTask(
  title: string,
  description: string,
  options?: {
    owner?: string
    blocks?: string[]
    blockedBy?: string[]
    metadata?: Record<string, unknown>
  },
): Task {
  taskCounter++
  const id = `task_${taskCounter}`
  const now = new Date().toISOString()
  const task: Task = {
    id,
    title,
    description,
    status: 'pending',
    owner: options?.owner,
    blocks: options?.blocks ?? [],
    blockedBy: options?.blockedBy ?? [],
    createdAt: now,
    updatedAt: now,
    metadata: options?.metadata,
  }
  tasks.set(id, task)
  writeTaskToDisk(task)
  return task
}

export function updateTask(
  id: string,
  updates: Partial<
    Pick<
      Task,
      'status' | 'result' | 'owner' | 'blocks' | 'blockedBy' | 'metadata'
    >
  >,
): Task | undefined {
  const task = tasks.get(id)
  if (!task) return undefined

  if (updates.status !== undefined) task.status = updates.status
  if (updates.result !== undefined) task.result = updates.result
  if (updates.owner !== undefined) task.owner = updates.owner
  if (updates.blocks !== undefined) task.blocks = updates.blocks
  if (updates.blockedBy !== undefined) task.blockedBy = updates.blockedBy
  if (updates.metadata !== undefined) task.metadata = updates.metadata
  task.updatedAt = new Date().toISOString()

  tasks.set(id, task)
  writeTaskToDisk(task)
  return task
}

export function listTasks(filter?: { status?: TaskStatus }): Task[] {
  const all = Array.from(tasks.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
  if (filter?.status) {
    return all.filter(t => t.status === filter.status)
  }
  return all
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id)
}

/**
 * Get tasks that are blocked (have unresolved blockedBy dependencies).
 */
export function getBlockedTasks(): Task[] {
  return listTasks().filter(t => {
    if (!t.blockedBy || t.blockedBy.length === 0) return false
    // A task is blocked if ANY of its blockedBy deps is not completed
    return t.blockedBy.some(depId => {
      const dep = tasks.get(depId)
      return !dep || dep.status !== 'completed'
    })
  })
}

export function getTasksBlocking(taskId: string): Task[] {
  const task = tasks.get(taskId)
  if (!task || !task.blocks) return []
  return task.blocks
    .map(id => tasks.get(id))
    .filter((t): t is Task => t !== undefined)
}

export function getTaskBlockedBy(taskId: string): Task[] {
  const task = tasks.get(taskId)
  if (!task || !task.blockedBy) return []
  return task.blockedBy
    .map(id => tasks.get(id))
    .filter((t): t is Task => t !== undefined)
}

export function resetTasks(): void {
  // Clear disk
  if (existsSync(TASKS_DIR)) {
    const files = readdirSync(TASKS_DIR).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        unlinkSync(join(TASKS_DIR, file))
      } catch {
        // ignore
      }
    }
  }
  taskCounter = 0
  tasks.clear()
  completedSinceLastVerification = 0
}

/**
 * Check whether a verification nudge should be emitted.
 * Returns a recommendation string or empty string.
 */
export function checkVerificationNudge(): string {
  if (completedSinceLastVerification >= VERIFICATION_NUDGE_THRESHOLD) {
    completedSinceLastVerification = 0
    return (
      'Note: Multiple tasks have been completed without verification. ' +
      'Consider using the Verify agent (Agent tool with agentType: "Verify") ' +
      'to review the implemented changes for correctness and completeness.'
    )
  }
  return ''
}

/**
 * Record a task completion for verification nudge tracking.
 */
export function recordTaskCompletion(status: TaskStatus): void {
  if (status === 'completed') {
    completedSinceLastVerification++
  } else {
    // Reset on non-completion (model is changing approach)
    completedSinceLastVerification = 0
  }
}

/**
 * Reset the verification nudge counter (e.g., verification was just performed).
 */
export function resetVerificationNudgeCounter(): void {
  completedSinceLastVerification = 0
}

// ============================================================
// AgentTaskStore — tracks async agent lifecycle (unchanged, transient)
// ============================================================

class AgentTaskStoreImpl {
  private agentTasks = new Map<TaskId, AgentTaskState>()

  /** Create a new agent task (status: running) */
  create(params: {
    agentId: string
    agentType: string
    agentName?: string
    prompt: string
    model: string
    toolUseId?: string
    abortController: AbortController
  }): AgentTaskState {
    const taskId = randomUUID()
    const now = Date.now()

    const state: AgentTaskState = {
      taskId,
      agentId: params.agentId,
      agentType: params.agentType,
      agentName: params.agentName ?? params.agentType,
      status: 'running',
      prompt: params.prompt,
      model: params.model,
      toolUseId: params.toolUseId,
      startTime: now,
      progress: {
        turnCount: 0,
        totalTokens: 0,
        toolUseCount: 0,
        lastActivity: now,
      },
      abortController: params.abortController,
      notified: false,
    }

    this.agentTasks.set(taskId, state)
    logDebug(
      `AgentTask [${taskId.slice(0, 8)}] created for ${params.agentType}`,
    )
    return state
  }

  /** Get a task by ID */
  get(taskId: TaskId): AgentTaskState | undefined {
    return this.agentTasks.get(taskId)
  }

  /** Get task by agent ID */
  getByAgentId(agentId: string): AgentTaskState | undefined {
    for (const task of this.agentTasks.values()) {
      if (task.agentId === agentId) return task
    }
    return undefined
  }

  /** List all tasks, optionally filtered */
  list(filter?: { status?: AgentTaskStatus }): AgentTaskState[] {
    const all = Array.from(this.agentTasks.values())
    if (filter?.status) {
      return all.filter(t => t.status === filter.status)
    }
    return all
  }

  /** Get all running tasks */
  getRunning(): AgentTaskState[] {
    return this.list({ status: 'running' })
  }

  /** Update progress for a running task */
  updateProgress(taskId: TaskId, progress: Partial<AgentProgress>): void {
    const task = this.agentTasks.get(taskId)
    if (!task) return
    task.progress = {
      ...task.progress,
      ...progress,
      lastActivity: Date.now(),
    }
  }

  /** Mark a task as completed */
  complete(taskId: TaskId, result: AgentResult): void {
    const task = this.agentTasks.get(taskId)
    if (!task) return
    task.status = 'completed'
    task.result = result
    task.endTime = Date.now()
    logDebug(
      `AgentTask [${taskId.slice(0, 8)}] completed: ${result.totalTokens} tokens, ${result.totalToolUseCount} tool uses`,
    )
    if (!task.notified) {
      task.notified = true
      enqueueNotification({
        mode: 'task-notification',
        priority: 'later',
        taskId: task.taskId,
        toolUseId: task.toolUseId,
        agentId: task.agentId,
        agentType: task.agentType,
        status: 'completed',
        summary: `Agent "${task.agentType}" completed: ${task.prompt.slice(0, 100)}`,
        result: result.content.join('\n\n').slice(0, 2000),
        usage: {
          totalTokens: result.totalTokens,
          toolUses: result.totalToolUseCount,
          durationMs: result.totalDurationMs,
        },
      })
    }
  }

  /** Mark a task as failed */
  fail(taskId: TaskId, error: string): void {
    const task = this.agentTasks.get(taskId)
    if (!task) return
    task.status = 'failed'
    task.error = error
    task.endTime = Date.now()
    logDebug(`AgentTask [${taskId.slice(0, 8)}] failed: ${error}`)
    if (!task.notified) {
      task.notified = true
      enqueueNotification({
        mode: 'task-notification',
        priority: 'later',
        taskId: task.taskId,
        toolUseId: task.toolUseId,
        agentId: task.agentId,
        agentType: task.agentType,
        status: 'failed',
        summary: `Agent "${task.agentType}" failed: ${error.slice(0, 100)}`,
        result: undefined,
        usage: {
          totalTokens: task.progress.totalTokens,
          toolUses: task.progress.toolUseCount,
          durationMs: Date.now() - task.startTime,
        },
      })
    }
  }

  /** Abort and mark a task as killed */
  kill(taskId: TaskId): void {
    const task = this.agentTasks.get(taskId)
    if (!task) return
    task.status = 'killed'
    task.endTime = Date.now()
    try {
      task.abortController.abort()
    } catch {
      // AbortController may already be aborted
    }
    logDebug(`AgentTask [${taskId.slice(0, 8)}] killed`)
  }

  /** Kill all running tasks */
  killAll(): void {
    for (const task of this.agentTasks.values()) {
      if (task.status === 'running') {
        this.kill(task.taskId)
      }
    }
  }

  /** Remove a task from the store */
  remove(taskId: TaskId): boolean {
    return this.agentTasks.delete(taskId)
  }

  /** Reset the store (for testing) */
  reset(): void {
    this.killAll()
    this.agentTasks.clear()
  }
}

/** Singleton AgentTaskStore */
export const agentTaskStore = new AgentTaskStoreImpl()
