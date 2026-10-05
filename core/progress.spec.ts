import { describe, expect, it } from 'vitest'
import {
  dailyProgress,
  focusedSecondsOn,
  formatFocusedDuration,
  pluralise,
  sessionsStartedOn,
  tasksCompletedOn,
} from './progress'
import { greetingForHour, isBeforeLocalDate, localDaysBetween, toLocalDate, toLocalHour } from './date'
import type { FocusSession, Task } from './types'

const LONDON = 'Europe/London'
const KARACHI = 'Asia/Karachi'
const NEW_YORK = 'America/New_York'

const DATE = '2026-10-05'
const MINUTE = 60_000

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 's1',
    taskId: 't1',
    plannedMinutes: 60,
    status: 'COMPLETED',
    startedAt: Date.UTC(2026, 9, 5, 9, 0, 0),
    lastResumedAt: null,
    accumulatedSeconds: 1_800,
    endedAt: Date.UTC(2026, 9, 5, 9, 30, 0),
    dodSnapshot: 'done',
    pauseCount: 0,
    ...overrides,
  }
}

function completedTask(id: string, completedAt: number | null): Pick<Task, 'status' | 'completedAt'> & { id: string } {
  return { id, status: completedAt === null ? 'TODO' : 'DONE', completedAt }
}

describe('focusedSecondsOn', () => {
  it('is zero with no sessions', () => {
    expect(focusedSecondsOn([], DATE, LONDON, Date.UTC(2026, 9, 5, 12))).toBe(0)
  })

  it('sums completed sessions on the day', () => {
    const sessions = [session({ accumulatedSeconds: 1_800 }), session({ id: 's2', accumulatedSeconds: 900 })]
    expect(focusedSecondsOn(sessions, DATE, LONDON, Date.UTC(2026, 9, 5, 18))).toBe(2_700)
  })

  it('excludes sessions from other days', () => {
    const sessions = [
      session({ accumulatedSeconds: 1_800 }),
      session({ id: 'yesterday', startedAt: Date.UTC(2026, 9, 4, 9), accumulatedSeconds: 3_600 }),
    ]
    expect(focusedSecondsOn(sessions, DATE, LONDON, Date.UTC(2026, 9, 5, 18))).toBe(1_800)
  })

  it('counts a switched-away (ABANDONED) session — the work was still done', () => {
    const sessions = [session({ status: 'ABANDONED', accumulatedSeconds: 1_380 })]
    expect(focusedSecondsOn(sessions, DATE, LONDON, Date.UTC(2026, 9, 5, 18))).toBe(1_380)
  })

  it('counts a live session at its current elapsed time, not its stale total', () => {
    const startedAt = Date.UTC(2026, 9, 5, 9, 0, 0)
    const live = session({
      status: 'STARTED',
      startedAt,
      lastResumedAt: startedAt,
      accumulatedSeconds: 0,
      endedAt: null,
    })
    expect(focusedSecondsOn([live], DATE, LONDON, startedAt + 12 * MINUTE)).toBe(720)
  })

  it('excludes paused time from a live paused session', () => {
    const startedAt = Date.UTC(2026, 9, 5, 9, 0, 0)
    const paused = session({
      status: 'PAUSED',
      startedAt,
      lastResumedAt: null,
      accumulatedSeconds: 600,
      endedAt: null,
    })
    // Two hours of wall clock later, still only the 10 banked minutes.
    expect(focusedSecondsOn([paused], DATE, LONDON, startedAt + 120 * MINUTE)).toBe(600)
  })

  it('attributes a session spanning local midnight to the day it started', () => {
    // 23:50 London on 5 Oct → 00:20 on 6 Oct.
    const startedAt = Date.UTC(2026, 9, 5, 22, 50, 0) // 23:50 BST
    const spanning = session({ startedAt, accumulatedSeconds: 1_800, endedAt: startedAt + 30 * MINUTE })
    const now = startedAt + 40 * MINUTE

    expect(focusedSecondsOn([spanning], '2026-10-05', LONDON, now)).toBe(1_800)
    expect(focusedSecondsOn([spanning], '2026-10-06', LONDON, now)).toBe(0)
  })

  it('resolves the day in the user timezone, not UTC', () => {
    // 21:00 UTC on 5 Oct is 02:00 on 6 Oct in Karachi.
    const startedAt = Date.UTC(2026, 9, 5, 21, 0, 0)
    const s = session({ startedAt, accumulatedSeconds: 600 })
    const now = startedAt + 20 * MINUTE

    expect(focusedSecondsOn([s], '2026-10-06', KARACHI, now)).toBe(600)
    expect(focusedSecondsOn([s], '2026-10-05', KARACHI, now)).toBe(0)
    // Same instant, different timezone, different day.
    expect(focusedSecondsOn([s], '2026-10-05', NEW_YORK, now)).toBe(600)
  })
})

describe('sessionsStartedOn', () => {
  it('counts completed, abandoned and live sessions but not other days', () => {
    const sessions = [
      session(),
      session({ id: 's2', status: 'ABANDONED' }),
      session({ id: 's3', status: 'STARTED', lastResumedAt: Date.UTC(2026, 9, 5, 9), endedAt: null }),
      session({ id: 's4', startedAt: Date.UTC(2026, 9, 1, 9) }),
    ]
    expect(sessionsStartedOn(sessions, DATE, LONDON)).toBe(3)
  })
})

describe('tasksCompletedOn', () => {
  const morning = Date.UTC(2026, 9, 5, 8, 0, 0)
  const noon = Date.UTC(2026, 9, 5, 11, 0, 0)

  it('is empty when nothing was completed', () => {
    expect(tasksCompletedOn([completedTask('a', null)], DATE, LONDON)).toEqual([])
  })

  it('returns only the day’s completions, newest first', () => {
    const tasks = [
      completedTask('early', morning),
      completedTask('late', noon),
      completedTask('yesterday', Date.UTC(2026, 9, 4, 11)),
      completedTask('open', null),
    ]
    expect(tasksCompletedOn(tasks, DATE, LONDON).map((t) => t.id)).toEqual(['late', 'early'])
  })

  it('ignores a completedAt timestamp on a task that is not DONE', () => {
    const tasks = [{ id: 'reopened', status: 'TODO' as const, completedAt: noon }]
    expect(tasksCompletedOn(tasks, DATE, LONDON)).toEqual([])
  })

  it('respects the timezone boundary', () => {
    // 22:00 UTC on 4 Oct is 03:00 on 5 Oct in Karachi but still 23:00 on 4 Oct in
    // London. The same completion lands on different days for different users.
    const lateUtc = Date.UTC(2026, 9, 4, 22, 0, 0)
    const tasks = [completedTask('x', lateUtc)]
    expect(tasksCompletedOn(tasks, '2026-10-05', KARACHI).map((t) => t.id)).toEqual(['x'])
    expect(tasksCompletedOn(tasks, '2026-10-05', LONDON)).toEqual([])
    expect(tasksCompletedOn(tasks, '2026-10-04', LONDON).map((t) => t.id)).toEqual(['x'])
  })
})

describe('dailyProgress', () => {
  it('combines focused time, session count and completions', () => {
    const now = Date.UTC(2026, 9, 5, 18)
    const result = dailyProgress({
      sessions: [session({ accumulatedSeconds: 2_580 }), session({ id: 's2', accumulatedSeconds: 1_200 })],
      tasks: [completedTask('a', Date.UTC(2026, 9, 5, 10)), completedTask('b', null)],
      date: DATE,
      timeZone: LONDON,
      now,
    })
    expect(result).toEqual({ focusedSeconds: 3_780, sessionsStarted: 2, tasksCompleted: 1 })
  })

  it('reports zeroes for a day with nothing on it', () => {
    expect(
      dailyProgress({ sessions: [], tasks: [], date: DATE, timeZone: LONDON, now: Date.UTC(2026, 9, 5, 9) }),
    ).toEqual({ focusedSeconds: 0, sessionsStarted: 0, tasksCompleted: 0 })
  })
})

describe('formatFocusedDuration', () => {
  it('formats the shapes the UI actually shows', () => {
    const cases: Array<[number, string]> = [
      [0, '0m'],
      [59, '0m'],
      [60, '1m'],
      [2_580, '43m'],
      [3_600, '1h'],
      [4_800, '1h 20m'],
      [22_800, '6h 20m'],
    ]
    for (const [seconds, expected] of cases) {
      expect(formatFocusedDuration(seconds)).toBe(expected)
    }
  })

  it('floors rather than rounds up — never claim a minute that was not worked', () => {
    expect(formatFocusedDuration(119)).toBe('1m')
  })
})

describe('pluralise', () => {
  it('handles the singular case', () => {
    expect(pluralise(1, 'task')).toBe('1 task')
    expect(pluralise(0, 'task')).toBe('0 tasks')
    expect(pluralise(4, 'session')).toBe('4 sessions')
  })
})

describe('date helpers', () => {
  it('converts an instant to the local calendar date', () => {
    expect(toLocalDate(Date.UTC(2026, 9, 5, 12), LONDON)).toBe('2026-10-05')
    expect(toLocalDate(Date.UTC(2026, 9, 5, 23, 30), KARACHI)).toBe('2026-10-06')
    expect(toLocalDate(Date.UTC(2026, 9, 5, 2, 30), NEW_YORK)).toBe('2026-10-04')
  })

  it('handles midnight without rolling the day', () => {
    expect(toLocalDate(Date.UTC(2026, 9, 5, 0, 0, 0), 'UTC')).toBe('2026-10-05')
    expect(toLocalHour(Date.UTC(2026, 9, 5, 0, 0, 0), 'UTC')).toBe(0)
  })

  it('reads the local hour for the greeting', () => {
    expect(toLocalHour(Date.UTC(2026, 9, 5, 7), LONDON)).toBe(8) // BST
    expect(toLocalHour(Date.UTC(2026, 9, 5, 7), KARACHI)).toBe(12)
  })

  it('survives a DST transition', () => {
    // UK clocks go back on 25 Oct 2026 at 02:00 BST.
    expect(toLocalDate(Date.UTC(2026, 9, 25, 0, 30), LONDON)).toBe('2026-10-25')
    expect(toLocalHour(Date.UTC(2026, 9, 25, 0, 30), LONDON)).toBe(1) // still BST
    expect(toLocalHour(Date.UTC(2026, 9, 25, 2, 30), LONDON)).toBe(2) // now GMT
  })

  it('compares local dates as calendar days', () => {
    expect(isBeforeLocalDate('2026-10-04', '2026-10-05')).toBe(true)
    expect(isBeforeLocalDate('2026-10-05', '2026-10-05')).toBe(false)
    expect(isBeforeLocalDate('2026-10-06', '2026-10-05')).toBe(false)
    expect(isBeforeLocalDate('2025-12-31', '2026-01-01')).toBe(true)
  })

  it('counts days between local dates across month and DST boundaries', () => {
    expect(localDaysBetween('2026-10-05', '2026-10-05')).toBe(0)
    expect(localDaysBetween('2026-10-05', '2026-10-12')).toBe(7)
    expect(localDaysBetween('2026-10-20', '2026-11-03')).toBe(14)
  })

  it('maps hours to greetings', () => {
    expect(greetingForHour(0)).toBe('Good morning')
    expect(greetingForHour(11)).toBe('Good morning')
    expect(greetingForHour(12)).toBe('Good afternoon')
    expect(greetingForHour(17)).toBe('Good afternoon')
    expect(greetingForHour(18)).toBe('Good evening')
    expect(greetingForHour(23)).toBe('Good evening')
  })
})
