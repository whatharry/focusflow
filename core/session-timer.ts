import type { EpochMs, FocusSession, SessionStatus } from './types'

/**
 * Focus session time algebra.
 *
 * The single rule that makes this trustworthy: elapsed focused time is *derived
 * from stored timestamps*, never accumulated by a ticking counter. A counter loses
 * time whenever iOS throttles the tab, the laptop sleeps, or the page reloads.
 * Timestamps are indifferent to all three.
 *
 * Paused time is structurally uncountable rather than carefully avoided: while
 * paused, `lastResumedAt` is null, so the running term contributes nothing and
 * `accumulatedSeconds` is frozen. A CHECK constraint in Postgres makes that an
 * invariant instead of a convention:
 *
 *   CHECK ((status = 'STARTED') = (last_resumed_at IS NOT NULL))
 */

/** The state the algebra needs. A superset of this is the stored session row. */
export type TimerState = Pick<
  FocusSession,
  'status' | 'startedAt' | 'lastResumedAt' | 'accumulatedSeconds' | 'plannedMinutes'
>

// ── Derived values ────────────────────────────────────────────────────────────

/** Focused seconds so far. Excludes every paused interval, by construction. */
export function elapsedFocusedSeconds(session: TimerState, now: EpochMs): number {
  const running =
    session.status === 'STARTED' && session.lastResumedAt !== null
      ? Math.max(0, Math.floor((now - session.lastResumedAt) / 1000))
      : 0
  return session.accumulatedSeconds + running
}

export function plannedSeconds(session: TimerState): number {
  return session.plannedMinutes * 60
}

/** Seconds left on the commitment. Negative once the session runs over. */
export function remainingSeconds(session: TimerState, now: EpochMs): number {
  return plannedSeconds(session) - elapsedFocusedSeconds(session, now)
}

/** Seconds worked past the planned duration. Never negative. */
export function overtimeSeconds(session: TimerState, now: EpochMs): number {
  return Math.max(0, -remainingSeconds(session, now))
}

export function isOvertime(session: TimerState, now: EpochMs): boolean {
  return remainingSeconds(session, now) <= 0
}

/** 0–1 fraction of the commitment completed, for the progress ring. */
export function progressFraction(session: TimerState, now: EpochMs): number {
  const total = plannedSeconds(session)
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, elapsedFocusedSeconds(session, now) / total))
}

// ── Transitions ───────────────────────────────────────────────────────────────

/**
 * The field patch a transition produces. `server/` applies these verbatim; keeping
 * the arithmetic here is what makes it unit-testable without a database.
 */
export interface SessionPatch {
  status: SessionStatus
  last_resumed_at: string | null
  accumulated_seconds: number
  ended_at?: string | null
  pause_count?: number
}

function toIso(epochMs: EpochMs): string {
  return new Date(epochMs).toISOString()
}

/** Seconds accrued in the currently-running interval, if any. */
function runningSeconds(session: TimerState, now: EpochMs): number {
  if (session.status !== 'STARTED' || session.lastResumedAt === null) return 0
  return Math.max(0, Math.floor((now - session.lastResumedAt) / 1000))
}

export function planPause(session: TimerState & { pauseCount: number }, now: EpochMs): SessionPatch {
  return {
    status: 'PAUSED',
    // Banking the running interval and clearing the resume marker in one step is
    // what guarantees the upcoming pause cannot be counted.
    accumulated_seconds: session.accumulatedSeconds + runningSeconds(session, now),
    last_resumed_at: null,
    pause_count: session.pauseCount + 1,
  }
}

export function planResume(session: TimerState, now: EpochMs): SessionPatch {
  return {
    status: 'STARTED',
    accumulated_seconds: session.accumulatedSeconds,
    last_resumed_at: toIso(now),
  }
}

/**
 * Finish. From STARTED the final running interval is banked first; from PAUSED
 * nothing is added, so paused time can never leak into a completed session.
 */
export function planFinish(session: TimerState, now: EpochMs): SessionPatch {
  return {
    status: 'COMPLETED',
    accumulated_seconds: session.accumulatedSeconds + runningSeconds(session, now),
    last_resumed_at: null,
    ended_at: toIso(now),
  }
}

/**
 * Leave without completing the task. The focused time is still real work and is
 * retained — penalising a switch would make "I'm Stuck" feel expensive, and that
 * button exists precisely to be used.
 */
export function planAbandon(session: TimerState, now: EpochMs): SessionPatch {
  return {
    status: 'ABANDONED',
    accumulated_seconds: session.accumulatedSeconds + runningSeconds(session, now),
    last_resumed_at: null,
    ended_at: toIso(now),
  }
}

// ── Runaway guard ─────────────────────────────────────────────────────────────

/**
 * How far past the plan a still-running session may go before we assume the user
 * walked away and left it running. Without this, one forgotten tab turns every
 * statistic into a lie — and dishonest numbers defeat the only purpose the
 * progress figures have.
 */
export const RUNAWAY_GRACE_SECONDS = 4 * 60 * 60

export interface RunawayVerdict {
  isRunaway: boolean
  /** What is currently recorded. */
  elapsedSeconds: number
  /** What we would record instead if the user accepts the trim. */
  trimmedSeconds: number
}

export function assessRunaway(session: TimerState, now: EpochMs): RunawayVerdict {
  const elapsedSeconds = elapsedFocusedSeconds(session, now)
  const threshold = plannedSeconds(session) + RUNAWAY_GRACE_SECONDS
  return {
    isRunaway: session.status === 'STARTED' && elapsedSeconds > threshold,
    elapsedSeconds,
    trimmedSeconds: plannedSeconds(session),
  }
}

/** Accept the trim: record exactly the planned duration and close the session. */
export function planTrimToPlanned(session: TimerState, now: EpochMs): SessionPatch {
  return {
    status: 'COMPLETED',
    accumulated_seconds: plannedSeconds(session),
    last_resumed_at: null,
    ended_at: toIso(now),
  }
}

// ── Display ───────────────────────────────────────────────────────────────────

/** `MM:SS` below an hour, `H:MM:SS` above it. Monospaced digits in the UI. */
export function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`
}
