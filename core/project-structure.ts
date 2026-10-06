import { pickNextAction, isStartableStatus, type NextAction, type PickNextActionInput, type TaskCandidate } from './next-action'
import type { Task } from './types'

/**
 * Project structure: progress, milestone grouping, and the project-scoped next
 * action.
 *
 * The one rule this file exists to protect is that FocusFlow has exactly one
 * next-action algorithm. The project screen does not get its own ordering — it
 * gets `pickNextAction` with a narrower list of tasks. That is why
 * `nextActionForProject` is three lines: anything longer would be a second
 * algorithm, and two algorithms drift.
 */

// ── Progress ──────────────────────────────────────────────────────────────────

export interface ProjectProgress {
  /** Tasks that count toward the denominator. */
  total: number
  completed: number
  /** Tasks neither done nor archived — what is actually left to do. */
  remaining: number
  /** 0–100, rounded. Always 0 for a project with no countable tasks. */
  percent: number
}

/**
 * One definition of "counts", used everywhere a percentage or a remaining count
 * appears in the product.
 *
 * ARCHIVED tasks are excluded from *both* halves of the fraction. The alternative
 * — counting them as incomplete — means filing a task away makes a project look
 * worse, which would teach people not to file anything away. Counting them as
 * complete is worse still: it would let you reach 100% by archiving the work.
 * Leaving them out entirely is the only reading where archiving is neutral.
 *
 * BACKLOG *is* counted. It is work you have admitted exists and chosen not to do
 * yet, and a progress bar that ignores it would quietly overstate how far along
 * you are.
 */
function counts(task: Pick<Task, 'status' | 'archivedAt'>): boolean {
  return task.status !== 'ARCHIVED' && task.archivedAt === null
}

function isComplete(task: Pick<Task, 'status'>): boolean {
  return task.status === 'DONE'
}

export function projectProgress(
  tasks: readonly Pick<Task, 'status' | 'archivedAt'>[],
): ProjectProgress {
  const countable = tasks.filter(counts)
  const completed = countable.filter(isComplete).length
  const total = countable.length

  return {
    total,
    completed,
    remaining: total - completed,
    // A project with nothing in it is 0% done, not 100%. Dividing by zero would
    // say "finished" about a project that has not been started.
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  }
}

/** Open work, in the sense the project list means it: startable right now. */
export function openTaskCount(tasks: readonly Pick<Task, 'status'>[]): number {
  return tasks.filter((task) => isStartableStatus(task.status)).length
}

// ── Milestone grouping ────────────────────────────────────────────────────────

export interface MilestoneRef {
  id: string
  title: string
  position: number
}

export interface MilestoneGroup {
  /** Null for the implicit group holding tasks not assigned to any milestone. */
  milestone: MilestoneRef | null
  tasks: Task[]
  progress: ProjectProgress
}

/** Open tasks before finished ones, then by the user's own ordering. */
function compareWithinGroup(a: Task, b: Task): number {
  const aDone = isComplete(a) ? 1 : 0
  const bDone = isComplete(b) ? 1 : 0
  return aDone - bDone || a.position - b.position || (a.createdAt - b.createdAt) || compare(a.id, b.id)
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Group a project's tasks under its milestones, in milestone order.
 *
 * Every milestone appears even when empty — a milestone you just created and have
 * not filled yet must still be visible, or creating one looks like it failed.
 * The unassigned group appears only when it has something in it.
 */
export function groupByMilestone(
  tasks: readonly Task[],
  milestones: readonly MilestoneRef[],
): MilestoneGroup[] {
  const visible = tasks.filter(counts)
  const ordered = [...milestones].sort(
    (a, b) => a.position - b.position || compare(a.id, b.id),
  )

  const groups: MilestoneGroup[] = ordered.map((milestone) => {
    const own = visible
      .filter((task) => task.milestoneId === milestone.id)
      .sort(compareWithinGroup)
    return { milestone, tasks: own, progress: projectProgress(own) }
  })

  const unassigned = visible.filter((task) => task.milestoneId === null).sort(compareWithinGroup)
  if (unassigned.length > 0) {
    groups.push({ milestone: null, tasks: unassigned, progress: projectProgress(unassigned) })
  }

  return groups
}

/**
 * The milestone a project is currently "on": the one holding its next action.
 *
 * Falls back to the earliest milestone with unfinished work, so a project whose
 * next task is unfiled still reads as being somewhere rather than nowhere.
 * Returns null when there are no milestones, or nothing left to do.
 */
export function currentMilestone(
  groups: readonly MilestoneGroup[],
  nextTaskId: string | null,
): MilestoneRef | null {
  if (nextTaskId !== null) {
    const holding = groups.find(
      (group) => group.milestone !== null && group.tasks.some((task) => task.id === nextTaskId),
    )
    if (holding?.milestone) return holding.milestone
  }

  return (
    groups.find((group) => group.milestone !== null && group.progress.remaining > 0)?.milestone ??
    null
  )
}

// ── Project-scoped next action ────────────────────────────────────────────────

/**
 * What to work on next *within one project*.
 *
 * Deliberately a filter in front of `pickNextAction` rather than a second
 * implementation. Two consequences fall out of that, both of them wanted:
 *
 *  • The project page can never disagree with Today about a task they both see.
 *    If Today's answer belongs to this project, this returns the same task.
 *  • An archived project still answers NONE, because the archived-project rule
 *    lives inside `pickNextAction` and is inherited rather than re-stated.
 *
 * A live session on a task in *another* project does not hijack this answer:
 * `pickNextAction` only honours a live session whose task is in the list it was
 * given, and that task has been filtered out.
 */
export function nextActionForProject(
  input: PickNextActionInput,
  projectId: string,
): NextAction {
  return pickNextAction({
    ...input,
    tasks: input.tasks.filter((task: TaskCandidate) => task.projectId === projectId),
  })
}
