import type { FocusSession, Project, Task } from '@/core/types'
import type { TaskCandidate } from '@/core/next-action'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Postgres rows → domain objects.
 *
 * The only job here is turning ISO timestamp strings into epoch milliseconds and
 * snake_case into camelCase, so `core/` never has to know what a database row
 * looks like. Deliberately not a repository layer: no caching, no query building,
 * no abstraction over Supabase — just the type boundary.
 */

type Tables = Database['public']['Tables']
export type ProjectRow = Tables['projects']['Row']
export type TaskRow = Tables['tasks']['Row']
export type MilestoneRow = Tables['milestones']['Row']
export type FocusSessionRow = Tables['focus_sessions']['Row']

function epoch(value: string): number {
  return Date.parse(value)
}

function epochOrNull(value: string | null): number | null {
  return value === null ? null : Date.parse(value)
}

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    position: row.position,
  }
}

export function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    milestoneId: row.milestone_id,
    title: row.title,
    description: row.description,
    definitionOfDone: row.definition_of_done,
    status: row.status,
    priority: row.priority,
    estimateMinutes: row.estimate_minutes,
    dueDate: row.due_date,
    position: row.position,
    completedAt: epochOrNull(row.completed_at),
    archivedAt: epochOrNull(row.archived_at),
    createdAt: epoch(row.created_at),
  }
}

/**
 * A task plus the milestone position the ordering needs. Milestone positions are
 * looked up from a map rather than joined, so one query feeds every task.
 */
export function toTaskCandidate(
  row: TaskRow,
  milestonePositions: ReadonlyMap<string, number>,
): TaskCandidate {
  return {
    ...toTask(row),
    milestonePosition:
      row.milestone_id === null ? null : (milestonePositions.get(row.milestone_id) ?? null),
  }
}

export function toFocusSession(row: FocusSessionRow): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id,
    plannedMinutes: row.planned_minutes,
    status: row.status,
    startedAt: epoch(row.started_at),
    lastResumedAt: epochOrNull(row.last_resumed_at),
    accumulatedSeconds: row.accumulated_seconds,
    endedAt: epochOrNull(row.ended_at),
    dodSnapshot: row.dod_snapshot,
    pauseCount: row.pause_count,
  }
}
