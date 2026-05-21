/**
 * Task store for managing user-visible sub-tasks in mini-v8.
 * Also provides AgentTaskStore for tracking async agent lifecycle.
 */

import { randomUUID } from 'crypto'
import type {
  AgentTaskState,
  AgentTaskStatus,
  AgentProgress,
  AgentResult,
  TaskId,
} from '../agents/agentTypes.js'
import { logDebug } from '../utils/log.js'
import { enqueueNotification } from './notificationQueue.js'

// ============================================================
// User-visible Task store (existing API, unchanged)
// ============================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  result?: string
  createdAt: string
  updatedAt: string
}

let taskCounter = 0
const tasks = new Map<string, Task>()

export function createTask(title: string, description: string): Task {
  taskCounter++
  const id = `task_${taskCounter}`
  const now = new Date().toISOString()
  const task: Task = {
    id,
    title,
    description,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }
  tasks.set(id, task)
  return task
}

export function updateTask(
  id: string,
  updates: Partial<Pick<Task, 'status' | 'result'>>,
): Task | undefined {
  const task = tasks.get(id)
  if (!task) return undefined
  if (updates.status) task.status = updates.status
  if (updates.result !== undefined) task.result = updates.result
  task.updatedAt = new Date().toISOString()
  tasks.set(id, task)
  return task
}

export function listTasks(): Task[] {
  return Array.from(tasks.values()).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  )
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id)
}

export function resetTasks(): void {
  taskCounter = 0
  tasks.clear()
}

// ============================================================
// AgentTaskStore — tracks async agent lifecycle
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
