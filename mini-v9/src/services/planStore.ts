/**
 * Plan file persistence for mini-v9.
 * Plans are saved as Markdown files with YAML frontmatter to
 * ~/.claude-code-mini/plans/{slug}.md
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

// ============================================================
// Types
// ============================================================

export interface PlanMeta {
  slug: string
  title: string
  createdAt: string
  updatedAt: string
  status: 'active' | 'completed' | 'cancelled'
  currentPhase: number
}

export interface PlanFile {
  meta: PlanMeta
  content: string
  fullText: string
}

const PLANS_DIR = join(homedir(), '.claude-code-mini', 'plans')

// ============================================================
// Internal helpers
// ============================================================

function ensurePlansDir(): string {
  if (!existsSync(PLANS_DIR)) {
    mkdirSync(PLANS_DIR, { recursive: true })
  }
  return PLANS_DIR
}

function planPath(slug: string): string {
  return join(PLANS_DIR, `${slug}.md`)
}

function serializeFrontmatter(meta: PlanMeta): string {
  return [
    '---',
    `slug: ${meta.slug}`,
    `title: ${meta.title}`,
    `createdAt: ${meta.createdAt}`,
    `updatedAt: ${meta.updatedAt}`,
    `status: ${meta.status}`,
    `currentPhase: ${meta.currentPhase}`,
    '---',
  ].join('\n')
}

function parseFrontmatter(
  raw: string,
): { meta: PlanMeta; content: string } | null {
  const lines = raw.split('\n')
  if (lines.length < 2 || lines[0]?.trim() !== '---') return null

  let endIdx = -1
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === '---') {
      endIdx = i
      break
    }
  }
  if (endIdx < 0) return null

  const meta: Partial<PlanMeta> = {}
  for (let i = 1; i < endIdx; i++) {
    const line = lines[i] ?? ''
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      switch (key) {
        case 'slug':
          meta.slug = value
          break
        case 'title':
          meta.title = value
          break
        case 'createdAt':
          meta.createdAt = value
          break
        case 'updatedAt':
          meta.updatedAt = value
          break
        case 'status':
          meta.status = value as PlanMeta['status']
          break
        case 'currentPhase':
          meta.currentPhase = Number(value)
          break
      }
    }
  }

  if (!meta.slug) return null

  const content = lines
    .slice(endIdx + 1)
    .join('\n')
    .trim()

  return {
    meta: {
      slug: meta.slug,
      title: meta.title ?? meta.slug,
      createdAt: meta.createdAt ?? new Date().toISOString(),
      updatedAt: meta.updatedAt ?? new Date().toISOString(),
      status: meta.status ?? 'active',
      currentPhase: meta.currentPhase ?? 1,
    },
    content,
  }
}

// ============================================================
// Slugs
// ============================================================

const ADJECTIVES = [
  'brave',
  'calm',
  'eager',
  'fierce',
  'gentle',
  'happy',
  'keen',
  'lively',
  'noble',
  'proud',
  'quick',
  'sharp',
  'swift',
  'vivid',
  'warm',
  'bright',
  'clear',
  'deep',
  'fair',
  'grand',
  'kind',
  'light',
  'merry',
  'neat',
  'pure',
  'rare',
  'safe',
  'tall',
  'vast',
  'wise',
  'young',
  'agile',
]

const NOUNS = [
  'action',
  'bridge',
  'craft',
  'dream',
  'eagle',
  'flame',
  'globe',
  'heart',
  'impact',
  'jewel',
  'knight',
  'ledge',
  'march',
  'north',
  'oasis',
  'pilot',
  'quest',
  'ridge',
  'scope',
  'thrust',
  'unify',
  'value',
  'wings',
  'yield',
  'arrow',
  'bloom',
  'coral',
  'dawn',
  'ember',
  'frost',
  'gleam',
  'harbor',
]

function randomSlug(): string {
  const adj =
    ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? 'bright'
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)] ?? 'plan'
  return `${adj}-${noun}`
}

function slugExists(slug: string): boolean {
  return existsSync(planPath(slug))
}

export function generateSlug(): string {
  for (let i = 0; i < 20; i++) {
    const slug = randomSlug()
    if (!slugExists(slug)) return slug
  }
  return `plan-${Date.now()}`
}

// ============================================================
// Public API
// ============================================================

/**
 * Save a plan to disk.
 * If slug is provided, it must be unique (throws otherwise).
 * If slug is omitted, one is generated.
 */
export function savePlan(
  content: string,
  options?: {
    slug?: string
    title?: string
    phase?: number
  },
): PlanFile {
  ensurePlansDir()

  const slug = options?.slug ?? generateSlug()
  const title = options?.title ?? slug
  const existingSlug = options?.slug
  if (existingSlug && slugExists(existingSlug)) {
    // Update existing plan
    const existing = loadPlan(existingSlug)
    if (existing) {
      const meta: PlanMeta = {
        ...existing.meta,
        title,
        updatedAt: new Date().toISOString(),
        status: 'active',
        currentPhase: options?.phase ?? existing.meta.currentPhase,
      }
      const fullText = serializeFrontmatter(meta) + '\n\n' + content
      writeFileSync(planPath(slug), fullText, 'utf-8')
      return { meta, content, fullText }
    }
  }

  const meta: PlanMeta = {
    slug,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active',
    currentPhase: options?.phase ?? 1,
  }
  const fullText = serializeFrontmatter(meta) + '\n\n' + content
  writeFileSync(planPath(slug), fullText, 'utf-8')
  return { meta, content, fullText }
}

/**
 * Load a plan from disk by slug.
 */
export function loadPlan(slug: string): PlanFile | null {
  const path = planPath(slug)
  if (!existsSync(path)) return null
  const raw = readFileSync(path, 'utf-8')
  const parsed = parseFrontmatter(raw)
  if (!parsed) return null
  return {
    meta: parsed.meta,
    content: parsed.content,
    fullText: raw,
  }
}

/**
 * Load the most recent active plan.
 */
export function loadLatestPlan(): PlanFile | null {
  if (!existsSync(PLANS_DIR)) return null
  const files = readdirSync(PLANS_DIR)
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse()

  if (files.length === 0) return null
  const latest = files[0]
  if (!latest) return null
  return loadPlan(latest.replace(/\.md$/, ''))
}

/**
 * Update the phase of a plan.
 */
export function updatePlanPhase(slug: string, phase: number): PlanFile | null {
  const plan = loadPlan(slug)
  if (!plan) return null
  return savePlan(plan.content, {
    slug: plan.meta.slug,
    title: plan.meta.title,
    phase,
  })
}

/**
 * Mark a plan as completed.
 */
export function completePlan(slug: string): PlanFile | null {
  const plan = loadPlan(slug)
  if (!plan) return null
  return savePlan(plan.content, {
    slug: plan.meta.slug,
    title: plan.meta.title,
    phase: plan.meta.currentPhase,
  })
}

/**
 * Cancel a plan.
 */
export function cancelPlan(slug: string): void {
  const path = planPath(slug)
  if (existsSync(path)) {
    unlinkSync(path)
  }
}

/**
 * List all plan slugs.
 */
export function listPlans(): PlanMeta[] {
  if (!existsSync(PLANS_DIR)) return []
  return readdirSync(PLANS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => loadPlan(f.replace(/\.md$/, '')))
    .filter((p): p is PlanFile => p !== null)
    .map(p => p.meta)
}

/**
 * Get the plans directory path.
 */
export function getPlansDir(): string {
  ensurePlansDir()
  return PLANS_DIR
}
