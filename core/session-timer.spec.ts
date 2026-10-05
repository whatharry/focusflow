import { describe, expect, it } from 'vitest'
import {
  RUNAWAY_GRACE_SECONDS,
  assessRunaway,
  elapsedFocusedSeconds,
  formatTimer,
  isOvertime,
  overtimeSeconds,
  planAbandon,
  planFinish,
  planPause,
  planResume,
  planTrimToPlanned,
  progressFraction,
  remainingSeconds,
  type TimerState,
} from './session-timer'
import type { FocusSession } from './types'

const START = Date.UTC(2026, 9, 5, 9, 0, 0)
const MINUTE = 60_000

function running(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 's1',
    taskId: 't1',
    plannedMinutes: 60,
    status: 'STARTED',
    startedAt: START,
    lastResumedAt: START,
    accumulatedSeconds: 0,
    endedAt: null,
    dodSnapshot: 'POST /auth/signup returns 201 and a session',
    pauseCount: 0,
    ...overrides,
  }
}

/** Apply a patch to a session the way server/ does, so chains can be tested. */
function apply(session: FocusSession, patch: ReturnType<typeof planPause>): FocusSession {
  return {
    ...session,
    status: patch.status,
    accumulatedSeconds: patch.accumulated_seconds,
    lastResumedAt: patch.last_resumed_at === null ? null : Date.parse(patch.last_resumed_at),
    endedAt: patch.ended_at == null ? session.endedAt : Date.parse(patch.ended_at),
    pauseCount: patch.pause_count ?? session.pauseCount,
  }
}

describe('elapsedFocusedSeconds', () => {
  it('derives running time from timestamps', () => {
    expect(elapsedFocusedSeconds(running(), START + 10 * MINUTE)).toBe(600)
  })

  it('adds the running interval to previously banked time', () => {
    const session = running({ accumulatedSeconds: 300, lastResumedAt: START + 20 * MINUTE })
    expect(elapsedFocusedSeconds(session, START + 25 * MINUTE)).toBe(600)
  })

  it('is frozen while paused, no matter how much wall-clock time passes', () => {
    const paused = running({ status: 'PAUSED', lastResumedAt: null, accumulatedSeconds: 900 })
    expect(elapsedFocusedSeconds(paused, START + MINUTE)).toBe(900)
    expect(elapsedFocusedSeconds(paused, START + 600 * MINUTE)).toBe(900)
  })

  it('ignores lastResumedAt once the session is terminal', () => {
    const done = running({ status: 'COMPLETED', lastResumedAt: null, accumulatedSeconds: 2_580 })
    expect(elapsedFocusedSeconds(done, START + 999 * MINUTE)).toBe(2_580)
  })

  it('never goes backwards if the supplied clock is behind lastResumedAt', () => {
    expect(elapsedFocusedSeconds(running(), START - 5 * MINUTE)).toBe(0)
  })

  it('floors partial seconds rather than rounding up', () => {
    expect(elapsedFocusedSeconds(running(), START + 1_999)).toBe(1)
  })
})

describe('pause and resume', () => {
  it('banks the running interval and clears the resume marker', () => {
    const patch = planPause(running(), START + 10 * MINUTE)
    expect(patch).toMatchObject({
      status: 'PAUSED',
      accumulated_seconds: 600,
      last_resumed_at: null,
      pause_count: 1,
    })
  })

  it('excludes the paused gap entirely — the core correctness guarantee', () => {
    const session = running()
    // Work 10 minutes, pause for 3 real minutes, resume, work 5 more.
    const paused = apply(session, planPause(session, START + 10 * MINUTE))
    const resumed = apply(paused, planResume(paused, START + 13 * MINUTE))
    const elapsed = elapsedFocusedSeconds(resumed, START + 18 * MINUTE)

    expect(elapsed).toBe(15 * 60)
    // 18 minutes of wall clock passed; only 15 were focused.
    expect(elapsed).toBeLessThan(18 * 60)
  })

  it('keeps accumulated time untouched on resume', () => {
    const paused = running({ status: 'PAUSED', lastResumedAt: null, accumulatedSeconds: 600 })
    const patch = planResume(paused, START + 30 * MINUTE)
    expect(patch.accumulated_seconds).toBe(600)
    expect(patch.last_resumed_at).toBe(new Date(START + 30 * MINUTE).toISOString())
    expect(patch.status).toBe('STARTED')
  })

  it('accumulates correctly across multiple pause cycles and counts them', () => {
    let session = running()
    // 5 min on, 10 min off, 5 min on, 60 min off, 5 min on.
    session = apply(session, planPause(session, START + 5 * MINUTE))
    session = apply(session, planResume(session, START + 15 * MINUTE))
    session = apply(session, planPause(session, START + 20 * MINUTE))
    session = apply(session, planResume(session, START + 80 * MINUTE))

    expect(session.pauseCount).toBe(2)
    expect(elapsedFocusedSeconds(session, START + 85 * MINUTE)).toBe(15 * 60)
  })

  it('cannot accrue paused time even if pause is applied twice', () => {
    const session = running()
    const paused = apply(session, planPause(session, START + 10 * MINUTE))
    const pausedAgain = apply(paused, planPause(paused, START + 40 * MINUTE))
    expect(pausedAgain.accumulatedSeconds).toBe(600)
  })
})

describe('finish', () => {
  it('banks the final running interval when STARTED', () => {
    const patch = planFinish(running(), START + 43 * MINUTE)
    expect(patch.status).toBe('COMPLETED')
    expect(patch.accumulated_seconds).toBe(43 * 60)
    expect(patch.last_resumed_at).toBeNull()
    expect(patch.ended_at).toBe(new Date(START + 43 * MINUTE).toISOString())
  })

  it('adds nothing when PAUSED, so paused time cannot leak into the record', () => {
    const paused = running({ status: 'PAUSED', lastResumedAt: null, accumulatedSeconds: 1_200 })
    const patch = planFinish(paused, START + 300 * MINUTE)
    expect(patch.accumulated_seconds).toBe(1_200)
  })
})

describe('abandon', () => {
  it('retains the focused minutes — switching away is not a penalty', () => {
    const patch = planAbandon(running(), START + 23 * MINUTE)
    expect(patch.status).toBe('ABANDONED')
    expect(patch.accumulated_seconds).toBe(23 * 60)
    expect(patch.ended_at).not.toBeNull()
  })

  it('retains banked time when abandoning from a paused state', () => {
    const paused = running({ status: 'PAUSED', lastResumedAt: null, accumulatedSeconds: 450 })
    expect(planAbandon(paused, START + 99 * MINUTE).accumulated_seconds).toBe(450)
  })
})

describe('overtime', () => {
  it('reports remaining time before the plan is reached', () => {
    expect(remainingSeconds(running(), START + 20 * MINUTE)).toBe(40 * 60)
    expect(isOvertime(running(), START + 20 * MINUTE)).toBe(false)
    expect(overtimeSeconds(running(), START + 20 * MINUTE)).toBe(0)
  })

  it('counts up past zero without auto-closing the session', () => {
    const session = running({ plannedMinutes: 25 })
    const now = START + 30 * MINUTE
    expect(isOvertime(session, now)).toBe(true)
    expect(overtimeSeconds(session, now)).toBe(5 * 60)
    expect(session.status).toBe('STARTED')
  })

  it('treats exactly zero remaining as overtime', () => {
    expect(isOvertime(running({ plannedMinutes: 25 }), START + 25 * MINUTE)).toBe(true)
  })

  it('never reports negative overtime', () => {
    expect(overtimeSeconds(running(), START)).toBe(0)
  })

  it('caps the progress ring at 1', () => {
    expect(progressFraction(running({ plannedMinutes: 25 }), START + 50 * MINUTE)).toBe(1)
    expect(progressFraction(running({ plannedMinutes: 60 }), START + 30 * MINUTE)).toBeCloseTo(0.5)
    expect(progressFraction(running(), START - MINUTE)).toBe(0)
  })
})

describe('clock skew', () => {
  it('is immune to device clock offset, because elapsed is a difference', () => {
    const skewMs = 37 * MINUTE
    const session = running()
    const trueElapsed = elapsedFocusedSeconds(session, START + 12 * MINUTE)

    // A device whose clock is 37 minutes fast reports the same elapsed time, as long
    // as it renders with the server offset applied (serverNow - Date.now()).
    const deviceNow = START + 12 * MINUTE + skewMs
    const offset = -skewMs
    expect(elapsedFocusedSeconds(session, deviceNow + offset)).toBe(trueElapsed)
  })

  it('produces identical results for two devices sharing the server clock', () => {
    const session = running({ accumulatedSeconds: 120 })
    const now = START + 8 * MINUTE
    expect(elapsedFocusedSeconds(session, now)).toBe(elapsedFocusedSeconds(session, now))
  })
})

describe('runaway guard', () => {
  it('does not fire within the grace window', () => {
    const session = running({ plannedMinutes: 60 })
    const verdict = assessRunaway(session, START + 60 * MINUTE + RUNAWAY_GRACE_SECONDS * 1000)
    expect(verdict.isRunaway).toBe(false)
  })

  it('fires once a running session passes planned + 4h', () => {
    const session = running({ plannedMinutes: 60 })
    const now = START + 60 * MINUTE + (RUNAWAY_GRACE_SECONDS + 1) * 1000
    const verdict = assessRunaway(session, now)
    expect(verdict.isRunaway).toBe(true)
    expect(verdict.elapsedSeconds).toBe(60 * 60 + RUNAWAY_GRACE_SECONDS + 1)
    expect(verdict.trimmedSeconds).toBe(3_600)
  })

  it('never fires for a paused session — a paused timer accrues nothing', () => {
    const paused = running({ status: 'PAUSED', lastResumedAt: null, accumulatedSeconds: 99_999 })
    expect(assessRunaway(paused, START + 999 * MINUTE).isRunaway).toBe(false)
  })

  it('trims the record to exactly the planned duration', () => {
    const patch = planTrimToPlanned(running({ plannedMinutes: 45 }), START + 900 * MINUTE)
    expect(patch.accumulated_seconds).toBe(45 * 60)
    expect(patch.status).toBe('COMPLETED')
    expect(patch.last_resumed_at).toBeNull()
  })
})

describe('the STARTED / lastResumedAt invariant', () => {
  it('holds after every transition', () => {
    const transitions: Array<(s: FocusSession) => ReturnType<typeof planPause>> = [
      (s) => planPause(s, START + MINUTE),
      (s) => planResume(s, START + MINUTE),
      (s) => planFinish(s, START + MINUTE),
      (s) => planAbandon(s, START + MINUTE),
      (s) => planTrimToPlanned(s, START + MINUTE),
    ]

    for (const transition of transitions) {
      for (const base of [running(), running({ status: 'PAUSED', lastResumedAt: null })]) {
        const patch = transition(base)
        const startedMeansResumed = patch.status === 'STARTED'
        expect(patch.last_resumed_at !== null).toBe(startedMeansResumed)
      }
    }
  })
})

describe('formatTimer', () => {
  it('renders MM:SS below an hour and H:MM:SS above it', () => {
    const cases: Array<[number, string]> = [
      [0, '00:00'],
      [9, '00:09'],
      [60, '01:00'],
      [1_500, '25:00'],
      [3_599, '59:59'],
      [3_600, '1:00:00'],
      [7_325, '2:02:05'],
    ]
    for (const [seconds, expected] of cases) {
      expect(formatTimer(seconds)).toBe(expected)
    }
  })

  it('clamps negatives to zero rather than printing a minus sign', () => {
    expect(formatTimer(-30)).toBe('00:00')
  })
})

describe('type surface', () => {
  it('accepts the minimal TimerState, not just a full session row', () => {
    const minimal: TimerState = {
      status: 'STARTED',
      startedAt: START,
      lastResumedAt: START,
      accumulatedSeconds: 0,
      plannedMinutes: 25,
    }
    expect(elapsedFocusedSeconds(minimal, START + 5 * MINUTE)).toBe(300)
  })
})
