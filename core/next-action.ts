import { isBeforeLocalDate, localDayNumber } from './date'
import {
  DEFAULT_SESSION_MINUTES,
  isLiveStatus,
  type EpochMs,
  type FocusSession,
  type LocalDate,
  type Project,
  type Task,
  type TaskOrderingContext,
  type TaskPriority,
} from './types'

/**
 * `pickNextAction` is the single most important function in FocusFlow.
 *
 * The product's promise is that you never decide what to work on — you open the app
 * and it is already decided. That only holds if the answer is *deterministic*: the
 * same data must always produce the same task, regardless of the order rows came
 * back from Postgres. Hence a total ordering with two guaranteed-unique final keys.
 *
 * `now` and `today` are always arguments. This file never reads the clock.
 */

// ── Public shape ──────────────────────────────────────────────────────────────

export type TaskCandidate = Task & TaskOrderingContext

/** Why there is nothing to propose. Each maps to a specific, actionable screen. */
export type NoneReason =
  /** Nothing capturable exists yet, or everything left is demoted to BACKLOG. */
  | 'NO_TASKS'
  /** Work exists but every bit of it is parked. */
  | 'ALL_BLOCKED'
  /** Today's priorities are all done while other work remains. Phase 3. */
  | 'PLAN_COMPLETE'
  /** The user chose "I'm done for today". Phase 3. */
  | 'DAY_CLOSED'
  /** Nothing is startable because everything needs breaking down first. Phase 5. */
  | 'ALL_OVERSIZED'
  /** Genuinely finished. */
  | 'ALL_DONE'

export type NextAction =
  | { kind: 'TASK'; task: TaskCandidate; intent: 'START' | 'RESUME' }
  | { kind: 'NONE'; reason: NoneReason }

/**
 * Forward declaration of the daily plan. Phase 1 always passes `null`; Phase 3
 * fills in the priority/also-today task ids and teaches `planRankOf` to read them.
 */
export interface DailyPlanRef {
  /** Set when the user chose "I'm done for today". */
  closedAt: EpochMs | null
}

export interface PickNextActionInput {
  tasks: readonly TaskCandidate[]
  projects: readonly Project[]
  /** Phase 3. Phase 1 passes `null`. */
  plan: DailyPlanRef | null
  /** A STARTED or PAUSED session, if one exists. */
  liveSession: FocusSession | null
  /** Today's calendar date in the user's timezone. */
  today: LocalDate
  /**
   * Current instant. Reserved for the plan-aware ordering added in Phase 3; passed
   * in rather than read so this function stays a pure function of its arguments.
   */
  now: EpochMs
}

// ── Ordering constants ────────────────────────────────────────────────────────

/**
 * Finite sentinels, not `Infinity`: the comparator subtracts key components, and
 * `Infinity - Infinity` is `NaN`, which would silently poison the comparison.
 */
const NO_DUE_DATE = Number.MAX_SAFE_INTEGER
const NO_MILESTONE = Number.MAX_SAFE_INTEGER

/** Standalone tasks ("Workout") sort ahead of project work rather than beneath it. */
const STANDALONE_PROJECT_POSITION = -1

const PLAN_RANK_UNPLANNED = 100

const PRIORITY_RANK: Record<TaskPriority, number> = {
  HIGH: 0,
  NORMAL: 1,
  LOW: 2,
}

// ── Eligibility ───────────────────────────────────────────────────────────────

/** Statuses that can be worked on right now. BACKLOG is an explicit "not now". */
function isStartableStatus(task: TaskCandidate): boolean {
  return task.status === 'TODO' || task.status === 'IN_PROGRESS'
}

/**
 * Tasks that still represent real, un-filed work — used to explain *why* there is
 * no next action. Excludes archived tasks and anything inside an archived project.
 */
function isVisible(task: TaskCandidate, activeProjectIds: ReadonlySet<string>): boolean {
  if (task.status === 'ARCHIVED' || task.archivedAt !== null) return false
  // A task whose project wasn't supplied cannot be proven startable, so it is hidden
  // rather than guessed at. Callers must always pass the projects they fetched.
  if (task.projectId !== null && !activeProjectIds.has(task.projectId)) return false
  return true
}

// ── Sort key ──────────────────────────────────────────────────────────────────

interface SortKey {
  inProgress: number
  planRank: number
  overdue: number
  dueSort: number
  priority: number
  projectPos: number
  milestonePos: number
  taskPos: number
  estimate: number
  createdAt: number
  id: string
}

function buildSortKey(
  task: TaskCandidate,
  projectPositions: ReadonlyMap<string, number>,
  today: LocalDate,
): SortKey {
  const dueDay = task.dueDate === null ? NO_DUE_DATE : localDayNumber(task.dueDate)

  return {
    // 1. Finish what you started.
    inProgress: task.status === 'IN_PROGRESS' ? 0 : 1,
    // 2. Today's stated intent outranks everything structural. Phase 1 has no plan,
    //    so every task ranks as "unplanned"; Phase 3 replaces this constant with
    //    priority position (0–2) → also-today → unplanned.
    planRank: PLAN_RANK_UNPLANNED,
    // 3–4. Real deadlines first, earliest first; undated work last.
    overdue: task.dueDate !== null && isBeforeLocalDate(task.dueDate, today) ? 0 : 1,
    dueSort: Number.isNaN(dueDay) ? NO_DUE_DATE : dueDay,
    // 5. Stated importance.
    priority: PRIORITY_RANK[task.priority],
    // 6–8. Respect the structure the user already built.
    projectPos:
      task.projectId === null
        ? STANDALONE_PROJECT_POSITION
        : (projectPositions.get(task.projectId) ?? NO_MILESTONE),
    milestonePos: task.milestonePosition ?? NO_MILESTONE,
    taskPos: task.position,
    // 9. A deliberate bias toward starting: a 25-minute task is easier to begin
    //    than a 120-minute one, and beginning is the whole point.
    estimate: task.estimateMinutes ?? DEFAULT_SESSION_MINUTES,
    // 10–11. Oldest commitment first, then id — together these guarantee a *total*
    //    order, so the result can never depend on database row order.
    createdAt: task.createdAt,
    id: task.id,
  }
}

function compareSortKeys(a: SortKey, b: SortKey): number {
  return (
    a.inProgress - b.inProgress ||
    a.planRank - b.planRank ||
    a.overdue - b.overdue ||
    a.dueSort - b.dueSort ||
    a.priority - b.priority ||
    a.projectPos - b.projectPos ||
    a.milestonePos - b.milestonePos ||
    a.taskPos - b.taskPos ||
    a.estimate - b.estimate ||
    a.createdAt - b.createdAt ||
    compareStrings(a.id, b.id)
  )
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

// ── Reasons ───────────────────────────────────────────────────────────────────

function explainEmpty(visible: readonly TaskCandidate[]): NoneReason {
  if (visible.length === 0) return 'NO_TASKS'
  if (visible.some((task) => task.status === 'BLOCKED')) return 'ALL_BLOCKED'
  if (visible.every((task) => task.status === 'DONE')) return 'ALL_DONE'
  // Work exists but it is all demoted to BACKLOG — nothing is *startable*, which
  // from the user's point of view is the same prompt as having nothing at all.
  return 'NO_TASKS'
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function pickNextAction(input: PickNextActionInput): NextAction {
  const { tasks, projects, plan, liveSession, today } = input

  // A live session always wins. Resuming beats starting, and this is also what
  // stops the UI ever offering a second concurrent session.
  if (liveSession !== null && isLiveStatus(liveSession.status)) {
    const sessionTask = tasks.find((task) => task.id === liveSession.taskId)
    if (sessionTask) {
      return { kind: 'TASK', task: sessionTask, intent: 'RESUME' }
    }
  }

  // Closing the day means "stop proposing work", even though work remains.
  if (plan?.closedAt != null) {
    return { kind: 'NONE', reason: 'DAY_CLOSED' }
  }

  const activeProjectIds = new Set(
    projects.filter((project) => project.status === 'ACTIVE').map((project) => project.id),
  )
  const projectPositions = new Map(projects.map((project) => [project.id, project.position]))

  const visible = tasks.filter((task) => isVisible(task, activeProjectIds))
  const startable = visible.filter(isStartableStatus)

  if (startable.length === 0) {
    return { kind: 'NONE', reason: explainEmpty(visible) }
  }

  let best = startable[0] as TaskCandidate
  let bestKey = buildSortKey(best, projectPositions, today)
  for (let i = 1; i < startable.length; i += 1) {
    const candidate = startable[i] as TaskCandidate
    const candidateKey = buildSortKey(candidate, projectPositions, today)
    if (compareSortKeys(candidateKey, bestKey) < 0) {
      best = candidate
      bestKey = candidateKey
    }
  }

  return { kind: 'TASK', task: best, intent: 'START' }
}

/**
 * Full ordering, for places that need more than the single winner (the project
 * detail screen in Phase 2, and "what's next after this" in the completion moment).
 */
export function rankStartableTasks(input: PickNextActionInput): TaskCandidate[] {
  const { tasks, projects, today } = input
  const activeProjectIds = new Set(
    projects.filter((project) => project.status === 'ACTIVE').map((project) => project.id),
  )
  const projectPositions = new Map(projects.map((project) => [project.id, project.position]))

  return tasks
    .filter((task) => isVisible(task, activeProjectIds) && isStartableStatus(task))
    .map((task) => ({ task, key: buildSortKey(task, projectPositions, today) }))
    .sort((a, b) => compareSortKeys(a.key, b.key))
    .map((entry) => entry.task)
}
