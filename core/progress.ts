import { toLocalDate } from './date'
import { elapsedFocusedSeconds } from './session-timer'
import { isLiveStatus, type EpochMs, type FocusSession, type LocalDate, type Task } from './types'

/**
 * Progress rollups.
 *
 * Two rules worth stating because both are easy to get wrong:
 *
 * 1. A day is the user's local calendar day, resolved through their timezone. UTC
 *    date comparison breaks every late-evening session and every DST boundary.
 * 2. A session is attributed to the day it *started*. A 23:50 → 00:20 session is
 *    work you sat down to do on the earlier day, and splitting it across two days
 *    would make both numbers wrong.
 */

export interface DailyProgress {
  focusedSeconds: number
  sessionsStarted: number
  tasksCompleted: number
}

/** Sessions that represent real work: finished, switched away from, or still running. */
function countsAsWork(session: Pick<FocusSession, 'status'>): boolean {
  // ABANDONED is included deliberately — the minutes were genuinely worked. The
  // word never appears in the UI; internally it only means "switched away".
  return (
    session.status === 'COMPLETED' ||
    session.status === 'ABANDONED' ||
    isLiveStatus(session.status)
  )
}

/**
 * Focused seconds on a given local day.
 *
 * A live session contributes its *current* elapsed time rather than its last
 * persisted total, so the figure on screen stays honest while the timer runs.
 */
export function focusedSecondsOn(
  sessions: readonly FocusSession[],
  date: LocalDate,
  timeZone: string,
  now: EpochMs,
): number {
  let total = 0
  for (const session of sessions) {
    if (!countsAsWork(session)) continue
    if (toLocalDate(session.startedAt, timeZone) !== date) continue
    total += isLiveStatus(session.status)
      ? elapsedFocusedSeconds(session, now)
      : session.accumulatedSeconds
  }
  return total
}

export function sessionsStartedOn(
  sessions: readonly FocusSession[],
  date: LocalDate,
  timeZone: string,
): number {
  return sessions.filter(
    (session) => countsAsWork(session) && toLocalDate(session.startedAt, timeZone) === date,
  ).length
}

/** Tasks completed on a given local day, newest first — the "wins" list. */
export function tasksCompletedOn<T extends Pick<Task, 'status' | 'completedAt'>>(
  tasks: readonly T[],
  date: LocalDate,
  timeZone: string,
): T[] {
  return tasks
    .filter(
      (task) =>
        task.status === 'DONE' &&
        task.completedAt !== null &&
        toLocalDate(task.completedAt, timeZone) === date,
    )
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
}

export function dailyProgress(
  input: {
    sessions: readonly FocusSession[]
    tasks: readonly Pick<Task, 'status' | 'completedAt'>[]
    date: LocalDate
    timeZone: string
    now: EpochMs
  },
): DailyProgress {
  const { sessions, tasks, date, timeZone, now } = input
  return {
    focusedSeconds: focusedSecondsOn(sessions, date, timeZone, now),
    sessionsStarted: sessionsStartedOn(sessions, date, timeZone),
    tasksCompleted: tasksCompletedOn(tasks, date, timeZone).length,
  }
}

// ── Display ───────────────────────────────────────────────────────────────────

/**
 * Human focused duration: `0m`, `43m`, `1h 20m`. Minutes are floored, because
 * claiming a minute that wasn't worked is the same dishonesty as claiming an hour.
 */
export function formatFocusedDuration(totalSeconds: number): string {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60))
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  if (hours === 0) return `${remainder}m`
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

/** `1 task` / `2 tasks` — small enough to inline, common enough to centralise. */
export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
