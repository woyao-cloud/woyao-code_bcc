import { describe, expect, test, beforeEach } from 'bun:test'
import {
  createTask,
  updateTask,
  listTasks,
  getTask,
  resetTasks,
} from '../services/taskStore.js'

beforeEach(() => {
  resetTasks()
})

describe('taskStore', () => {
  test('creates a task with pending status', () => {
    const task = createTask('Test task', 'Do something')
    expect(task.id).toMatch(/task_\d+/)
    expect(task.title).toBe('Test task')
    expect(task.description).toBe('Do something')
    expect(task.status).toBe('pending')
  })

  test('creates multiple tasks with unique IDs', () => {
    const t1 = createTask('A', 'a')
    const t2 = createTask('B', 'b')
    expect(t1.id).not.toBe(t2.id)
  })

  test('updates task status', () => {
    const task = createTask('Test', 'desc')
    const updated = updateTask(task.id, { status: 'in_progress' })
    expect(updated).toBeDefined()
    expect(updated!.status).toBe('in_progress')
  })

  test('updates task with result', () => {
    const task = createTask('Test', 'desc')
    updateTask(task.id, { status: 'completed', result: 'Done!' })
    const t = getTask(task.id)
    expect(t!.status).toBe('completed')
    expect(t!.result).toBe('Done!')
  })

  test('returns undefined for non-existent task update', () => {
    expect(updateTask('nonexistent', { status: 'completed' })).toBeUndefined()
  })

  test('lists all tasks', () => {
    createTask('Task A', 'a')
    createTask('Task B', 'b')
    const tasks = listTasks()
    expect(tasks.length).toBe(2)
    expect(tasks[0].title).toBe('Task A')
    expect(tasks[1].title).toBe('Task B')
  })

  test('resets all tasks', () => {
    createTask('Test', 'desc')
    expect(listTasks().length).toBe(1)
    resetTasks()
    expect(listTasks().length).toBe(0)
  })

  test('getTask returns task by id', () => {
    const task = createTask('Find me', 'desc')
    const found = getTask(task.id)
    expect(found).toBeDefined()
    expect(found!.title).toBe('Find me')
  })

  test('getTask returns undefined for unknown id', () => {
    expect(getTask('unknown')).toBeUndefined()
  })

  test('task has timestamp fields', () => {
    const task = createTask('Test', 'desc')
    expect(task.createdAt).toBeDefined()
    expect(task.updatedAt).toBeDefined()
  })
})
