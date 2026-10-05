import { describe, expect, it } from 'vitest'
import { pickNextAction, rankStartableTasks, type TaskCandidate } from './next-action'
import type { FocusSession, Project, TaskPriority, TaskStatus } from './types'

const TODAY = '2026-10-05'
const NOW = Date.UTC(2026, 9, 5, 9, 0, 0)

function project(id: string, overrides: Partial<Project> = {}): Project {
  return { id, name: id, status: 'ACTIVE', position: 1000, ...overrides }
}

let autoCreatedAt = 1_000
function task(id: string, overrides: Partial<TaskCandidate> = {}): TaskCandidate {
  autoCreatedAt += 1000
  return {
    id,
    projectId: null,
    milestoneId: null,
    milestonePosition: null,
    title: id,
    description: null,
    definitionOfDone: null,
    status: 'TODO' satisfies TaskStatus,
    priority: 'NORMAL' satisfies TaskPriority,
    estimateMinutes: 60,
    dueDate: null,
    position: 1000,
    completedAt: null,
    archivedAt: null,
    createdAt: autoCreatedAt,
    ...overrides,
  }
}

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 'session-1',
    taskId: 'task-live',
    plannedMinutes: 60,
    status: 'STARTED',
    startedAt: NOW - 600_000,
    lastResumedAt: NOW - 600_000,
    accumulatedSeconds: 0,
    endedAt: null,
    dodSnapshot: 'Done looks like this.',
    pauseCount: 0,
    ...overrides,
  }
}

function pick(
  tasks: readonly TaskCandidate[],
  projects: readonly Project[] = [],
  liveSession: FocusSession | null = null,
) {
  return pickNextAction({ tasks, projects, plan: null, liveSession, today: TODAY, now: NOW })
}

/** The winner's id, or the NONE reason — keeps assertions readable. */
function winner(tasks: readonly TaskCandidate[], projects: readonly Project[] = []): string {
  const result = pick(tasks, projects)
  return result.kind === 'TASK' ? result.task.id : `NONE:${result.reason}`
}

describe('pickNextAction — empty and degenerate states', () => {
  it('returns NO_TASKS when nothing exists', () => {
    expect(pick([])).toEqual({ kind: 'NONE', reason: 'NO_TASKS' })
  })

  it('returns NO_TASKS when every remaining task is demoted to BACKLOG', () => {
    expect(winner([task('a', { status: 'BACKLOG' })])).toBe('NONE:NO_TASKS')
  })

  it('returns ALL_BLOCKED when work exists but all of it is parked', () => {
    expect(winner([task('a', { status: 'BLOCKED' }), task('b', { status: 'BLOCKED' })])).toBe(
      'NONE:ALL_BLOCKED',
    )
  })

  it('prefers ALL_BLOCKED over ALL_DONE when both parked and finished work exist', () => {
    expect(
      winner([task('a', { status: 'BLOCKED' }), task('b', { status: 'DONE', completedAt: NOW })]),
    ).toBe('NONE:ALL_BLOCKED')
  })

  it('returns ALL_DONE when everything is finished', () => {
    expect(winner([task('a', { status: 'DONE', completedAt: NOW })])).toBe('NONE:ALL_DONE')
  })

  it('returns DAY_CLOSED when the user has finished for the day, even with work left', () => {
    const result = pickNextAction({
      tasks: [task('a')],
      projects: [],
      plan: { closedAt: NOW },
      liveSession: null,
      today: TODAY,
      now: NOW,
    })
    expect(result).toEqual({ kind: 'NONE', reason: 'DAY_CLOSED' })
  })

  it('ignores archived tasks entirely', () => {
    expect(
      winner([task('a', { status: 'ARCHIVED' }), task('b', { archivedAt: NOW, status: 'TODO' })]),
    ).toBe('NONE:NO_TASKS')
  })
})

describe('pickNextAction — live session', () => {
  it('always wins, with RESUME intent, over a higher-ranked task', () => {
    const tasks = [
      task('task-live'),
      task('urgent', { priority: 'HIGH', dueDate: '2026-01-01' }),
    ]
    const result = pick(tasks, [], session({ taskId: 'task-live' }))
    expect(result).toEqual({ kind: 'TASK', task: expect.objectContaining({ id: 'task-live' }), intent: 'RESUME' })
  })

  it('wins while PAUSED too — a paused session is still the thing to return to', () => {
    const result = pick(
      [task('task-live'), task('other', { priority: 'HIGH' })],
      [],
      session({ status: 'PAUSED', lastResumedAt: null, accumulatedSeconds: 300 }),
    )
    expect(result.kind === 'TASK' && result.task.id).toBe('task-live')
  })

  it('is ignored once the session is COMPLETED', () => {
    const result = pick(
      [task('task-live'), task('other', { priority: 'HIGH' })],
      [],
      session({ status: 'COMPLETED', lastResumedAt: null, endedAt: NOW }),
    )
    expect(result.kind === 'TASK' && result.task.id).toBe('other')
  })

  it('falls through to normal ranking when the session task is not in the set', () => {
    const result = pick([task('other')], [], session({ taskId: 'missing' }))
    expect(result).toEqual({ kind: 'TASK', task: expect.objectContaining({ id: 'other' }), intent: 'START' })
  })
})

describe('pickNextAction — ordering', () => {
  it('ranks IN_PROGRESS above a HIGH-priority overdue TODO', () => {
    expect(
      winner([
        task('todo-urgent', { priority: 'HIGH', dueDate: '2026-01-01' }),
        task('in-progress', { status: 'IN_PROGRESS' }),
      ]),
    ).toBe('in-progress')
  })

  it('ranks overdue above due-today above future above undated', () => {
    const tasks = [
      task('undated'),
      task('future', { dueDate: '2026-12-01' }),
      task('today', { dueDate: TODAY }),
      task('overdue', { dueDate: '2026-10-01' }),
    ]
    expect(winner(tasks)).toBe('overdue')
    expect(rankStartableTasks({ tasks, projects: [], plan: null, liveSession: null, today: TODAY, now: NOW }).map((t) => t.id)).toEqual([
      'overdue',
      'today',
      'future',
      'undated',
    ])
  })

  it('ranks earlier overdue dates first', () => {
    expect(
      winner([task('late', { dueDate: '2026-10-04' }), task('later', { dueDate: '2026-09-01' })]),
    ).toBe('later')
  })

  it('ranks HIGH above NORMAL above LOW when deadlines tie', () => {
    const tasks = [task('low', { priority: 'LOW' }), task('normal'), task('high', { priority: 'HIGH' })]
    expect(winner(tasks)).toBe('high')
  })

  it('ranks standalone tasks ahead of project work, not beneath it', () => {
    const tasks = [task('project-task', { projectId: 'p1' }), task('workout')]
    expect(winner(tasks, [project('p1', { position: 1000 })])).toBe('workout')
  })

  it('respects project position', () => {
    const tasks = [
      task('second', { projectId: 'p2' }),
      task('first', { projectId: 'p1' }),
    ]
    const projects = [project('p1', { position: 1000 }), project('p2', { position: 2000 })]
    expect(winner(tasks, projects)).toBe('first')
  })

  it('respects milestone position, and sorts unassigned tasks after milestoned ones', () => {
    const tasks = [
      task('no-milestone', { projectId: 'p1', milestonePosition: null }),
      task('milestone-2', { projectId: 'p1', milestoneId: 'm2', milestonePosition: 2000 }),
      task('milestone-1', { projectId: 'p1', milestoneId: 'm1', milestonePosition: 1000 }),
    ]
    const ranked = rankStartableTasks({
      tasks,
      projects: [project('p1')],
      plan: null,
      liveSession: null,
      today: TODAY,
      now: NOW,
    })
    expect(ranked.map((t) => t.id)).toEqual(['milestone-1', 'milestone-2', 'no-milestone'])
  })

  it('respects task position within a milestone', () => {
    const tasks = [
      task('b', { projectId: 'p1', milestonePosition: 1000, position: 2000 }),
      task('a', { projectId: 'p1', milestonePosition: 1000, position: 1000 }),
    ]
    expect(winner(tasks, [project('p1')])).toBe('a')
  })

  it('breaks ties toward the shorter estimate — starting is the point', () => {
    const tasks = [
      task('long', { estimateMinutes: 120, position: 1000 }),
      task('short', { estimateMinutes: 25, position: 1000 }),
    ]
    expect(winner(tasks)).toBe('short')
  })

  it('treats a missing estimate as 60 minutes', () => {
    const tasks = [
      task('unknown', { estimateMinutes: null, position: 1000 }),
      task('ninety', { estimateMinutes: 90, position: 1000 }),
      task('twentyfive', { estimateMinutes: 25, position: 1000 }),
    ]
    const ranked = rankStartableTasks({ tasks, projects: [], plan: null, liveSession: null, today: TODAY, now: NOW })
    expect(ranked.map((t) => t.id)).toEqual(['twentyfive', 'unknown', 'ninety'])
  })

  it('breaks remaining ties by createdAt, oldest commitment first', () => {
    const base = { estimateMinutes: 60, position: 1000 }
    const tasks = [
      task('newer', { ...base, createdAt: 5_000 }),
      task('older', { ...base, createdAt: 2_000 }),
    ]
    expect(winner(tasks)).toBe('older')
  })

  it('breaks a total tie by id, so the result is never arbitrary', () => {
    const identical = { estimateMinutes: 60, position: 1000, createdAt: 7_000 }
    expect(winner([task('b-task', identical), task('a-task', identical)])).toBe('a-task')
  })
})

describe('pickNextAction — eligibility', () => {
  it('excludes BLOCKED tasks from selection while startable work remains', () => {
    expect(
      winner([task('blocked', { status: 'BLOCKED', priority: 'HIGH' }), task('open')]),
    ).toBe('open')
  })

  it('excludes BACKLOG tasks from selection', () => {
    expect(
      winner([task('backlog', { status: 'BACKLOG', priority: 'HIGH' }), task('open')]),
    ).toBe('open')
  })

  it('excludes DONE tasks from selection', () => {
    expect(
      winner([task('done', { status: 'DONE', completedAt: NOW, priority: 'HIGH' }), task('open')]),
    ).toBe('open')
  })

  it('excludes tasks belonging to an archived project', () => {
    const tasks = [task('archived-project-task', { projectId: 'p-old', priority: 'HIGH' }), task('standalone')]
    const projects = [project('p-old', { status: 'ARCHIVED' })]
    expect(winner(tasks, projects)).toBe('standalone')
  })

  it('hides a task whose project was not supplied rather than guessing it is active', () => {
    expect(winner([task('orphan', { projectId: 'p-missing' })], [])).toBe('NONE:NO_TASKS')
  })
})

describe('pickNextAction — determinism', () => {
  const projects = [project('p1', { position: 1000 }), project('p2', { position: 2000 })]
  const tasks: TaskCandidate[] = [
    task('t1', { projectId: 'p1', milestonePosition: 1000, position: 1000, priority: 'NORMAL' }),
    task('t2', { projectId: 'p1', milestonePosition: 1000, position: 2000, priority: 'HIGH' }),
    task('t3', { projectId: 'p2', milestonePosition: null, position: 1000, dueDate: '2026-10-09' }),
    task('t4', { status: 'IN_PROGRESS', projectId: 'p2', position: 3000 }),
    task('t5', { priority: 'LOW' }),
    task('t6', { dueDate: '2026-10-01', projectId: 'p1', position: 4000 }),
    task('t7', { status: 'BLOCKED' }),
    task('t8', { status: 'DONE', completedAt: NOW }),
  ]

  it('produces the same winner for every input permutation', () => {
    const expected = winner(tasks, projects)
    expect(expected).toBe('t4')

    // 200 deterministic rotations/reversals — if the function leaned on array order
    // at any point, one of these would disagree.
    for (let shift = 0; shift < tasks.length; shift += 1) {
      const rotated = [...tasks.slice(shift), ...tasks.slice(0, shift)]
      expect(winner(rotated, projects)).toBe(expected)
      expect(winner([...rotated].reverse(), projects)).toBe(expected)
      expect(winner(rotated, [...projects].reverse())).toBe(expected)
    }
  })

  it('produces the same full ranking for every input permutation', () => {
    const rank = (list: readonly TaskCandidate[]) =>
      rankStartableTasks({ tasks: list, projects, plan: null, liveSession: null, today: TODAY, now: NOW }).map(
        (t) => t.id,
      )
    const expected = rank(tasks)
    for (let shift = 0; shift < tasks.length; shift += 1) {
      const rotated = [...tasks.slice(shift), ...tasks.slice(0, shift)]
      expect(rank(rotated)).toEqual(expected)
      expect(rank([...rotated].reverse())).toEqual(expected)
    }
  })

  it('does not mutate its input', () => {
    const snapshot = tasks.map((t) => t.id)
    pick(tasks, projects)
    rankStartableTasks({ tasks, projects, plan: null, liveSession: null, today: TODAY, now: NOW })
    expect(tasks.map((t) => t.id)).toEqual(snapshot)
  })
})
