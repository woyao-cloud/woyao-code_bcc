/**
 * Task store for managing sub-tasks in mini-v3.
 */

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
