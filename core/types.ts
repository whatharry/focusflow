/**
 * Domain types for FocusFlow.
 *
 * This file is the vocabulary the business rules speak. It is deliberately free of
 * any database, React or framework types: `server/` maps Supabase rows onto these
 * shapes, and `core/` reasons about nothing else.
 */

// ── Enums (mirrored exactly by the Postgres enums in 0001_core.sql) ────────────

export const TASK_STATUSES = [
  'BACKLOG',
  'TODO',
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'ARCHIVED',
] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

export const TASK_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const
export type TaskPriority = (typeof TASK_PRIORITIES)[number]

export const PROJECT_STATUSES = ['ACTIVE', 'ARCHIVED'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const SESSION_STATUSES = ['STARTED', 'PAUSED', 'COMPLETED', 'ABANDONED'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

/** A session that is neither completed nor abandoned — i.e. the one you can return to. */
export type LiveSessionStatus = Extract<SessionStatus, 'STARTED' | 'PAUSED'>

export function isLiveStatus(status: SessionStatus): status is LiveSessionStatus {
  return status === 'STARTED' || status === 'PAUSED'
}

// ── Scalars ───────────────────────────────────────────────────────────────────

/** Epoch milliseconds. Always passed in, never read from the clock inside core/. */
export type EpochMs = number

/** A calendar day in the user's own timezone, as `YYYY-MM-DD`. Never a UTC date. */
export type LocalDate = string

// ── Entities ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string
  name: string
  status: ProjectStatus
  position: number
}

export interface Task {
  id: string
  projectId: string | null
  milestoneId: string | null
  title: string
  description: string | null
  definitionOfDone: string | null
  status: TaskStatus
  priority: TaskPriority
  estimateMinutes: number | null
  /** Due date in the user's local calendar, `YYYY-MM-DD`. */
  dueDate: LocalDate | null
  position: number
  completedAt: EpochMs | null
  archivedAt: EpochMs | null
  createdAt: EpochMs
}

export interface FocusSession {
  id: string
  taskId: string
  plannedMinutes: number
  status: SessionStatus
  startedAt: EpochMs
  /** Non-null exactly when status is STARTED. Enforced by a DB CHECK constraint. */
  lastResumedAt: EpochMs | null
  accumulatedSeconds: number
  endedAt: EpochMs | null
  dodSnapshot: string
  pauseCount: number
}

/**
 * Ordering context a task needs that lives on its parent rows. Kept separate from
 * `Task` so `pickNextAction` can be handed plain data without a join-shaped type.
 */
export interface TaskOrderingContext {
  /** Position of the task's milestone within its project; null when unassigned. */
  milestonePosition: number | null
}

// ── Session duration ladder ───────────────────────────────────────────────────

export const SESSION_DURATION_OPTIONS = [25, 45, 60, 90, 120] as const
export type SessionDurationOption = (typeof SESSION_DURATION_OPTIONS)[number]
export const DEFAULT_SESSION_MINUTES = 60 satisfies SessionDurationOption

export function isSessionDurationOption(n: number): n is SessionDurationOption {
  return (SESSION_DURATION_OPTIONS as readonly number[]).includes(n)
}

/**
 * Snap an arbitrary estimate onto the ladder, for pre-filling the duration picker
 * from a task's estimate. Never returns something the picker can't display.
 */
export function clampToLadder(minutes: number | null | undefined): SessionDurationOption {
  if (minutes == null || !Number.isFinite(minutes)) return DEFAULT_SESSION_MINUTES
  let best: SessionDurationOption = SESSION_DURATION_OPTIONS[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const option of SESSION_DURATION_OPTIONS) {
    const distance = Math.abs(option - minutes)
    // `<` not `<=` so ties resolve to the shorter option: easier to start.
    if (distance < bestDistance) {
      bestDistance = distance
      best = option
    }
  }
  return best
}
