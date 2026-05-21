import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
} from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface CronJob {
  id: string
  expression: string
  command: string
  description: string
  createdAt: number
  lastRun?: number
  nextRun?: number
  runCount: number
}

interface CronSchedule {
  jobs: CronJob[]
}

const CRON_DIR = join(homedir(), '.claude-code-mini', 'cron')
const CRON_FILE = join(CRON_DIR, 'jobs.json')

function ensureDir(): void {
  if (!existsSync(CRON_DIR)) {
    mkdirSync(CRON_DIR, { recursive: true })
  }
}

function loadJobs(): CronJob[] {
  ensureDir()
  if (!existsSync(CRON_FILE)) return []
  try {
    const data = JSON.parse(readFileSync(CRON_FILE, 'utf-8')) as CronSchedule
    return data.jobs ?? []
  } catch {
    return []
  }
}

function saveJobs(jobs: CronJob[]): void {
  ensureDir()
  writeFileSync(CRON_FILE, JSON.stringify({ jobs }, null, 2), 'utf-8')
}

export function createCronJob(params: {
  expression: string
  command: string
  description?: string
}): CronJob {
  const jobs = loadJobs()
  const id = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const job: CronJob = {
    id,
    expression: params.expression,
    command: params.command,
    description: params.description ?? '',
    createdAt: Date.now(),
    runCount: 0,
  }
  jobs.push(job)
  saveJobs(jobs)
  return job
}

export function deleteCronJob(id: string): boolean {
  const jobs = loadJobs()
  const idx = jobs.findIndex(j => j.id === id)
  if (idx === -1) return false
  jobs.splice(idx, 1)
  saveJobs(jobs)
  return true
}

export function listCronJobs(): CronJob[] {
  return loadJobs()
}

export function getCronJob(id: string): CronJob | undefined {
  return loadJobs().find(j => j.id === id)
}
