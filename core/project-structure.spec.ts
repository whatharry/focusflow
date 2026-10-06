import { describe, expect, it } from 'vitest'
import { pickNextAction, type TaskCandidate } from './next-action'
import {
  currentMilestone,
  groupByMilestone,
  nextActionForProject,
  openTaskCount,
  projectProgress,
  type MilestoneRef,
} from './project-structure'
import type { FocusSession, Project, TaskStatus } from './types'

const TODAY = '2026-10-05'
const NOW = Date.UTC(2026, 9, 5, 9, 0, 0)

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
    status: 'TODO',
    priority: 'NORMAL',
    estimateMinutes: 60,
    dueDate: null,
    position: 1000,
    completedAt: null,
    archivedAt: null,
    createdAt: autoCreatedAt,
    ...overrides,
  }
}

function done(id: string, overrides: Partial<TaskCandidate> = {}): TaskCandidate {
  return task(id, { status: 'DONE', completedAt: NOW, ...overrides })
}

function project(id: string, overrides: Partial<Project> = {}): Project {
  return { id, name: id, status: 'ACTIVE', position: 1000, ...overrides }
}

function milestone(id: string, position: number, title = id): MilestoneRef {
  return { id, title, position }
}

function input(tasks: TaskCandidate[], projects: Project[], liveSession: FocusSession | null = null) {
  return { tasks, projects, plan: null, liveSession, today: TODAY, now: NOW }
}

// ── Progress ──────────────────────────────────────────────────────────────────

describe('projectProgress', () => {
  it('is zero percent for a project with no tasks, not a division by zero', () => {
    expect(projectProgress([])).toEqual({ total: 0, completed: 0, remaining: 0, percent: 0 })
  })

  it('counts DONE over everything countable', () => {
    const progress = projectProgress([done('a'), done('b'), task('c'), task('d')])
    expect(progress).toEqual({ total: 4, completed: 2, remaining: 2, percent: 50 })
  })

  it('rounds to whole percents', () => {
    expect(projectProgress([done('a'), task('b'), task('c')]).percent).toBe(33)
    expect(projectProgress([done('a'), done('b'), task('c')]).percent).toBe(67)
  })

  it('excludes archived tasks from both halves of the fraction', () => {
    // Archiving the only unfinished task must not flip the project to 100%,
    // and must not leave it stuck below it either — it leaves the fraction alone.
    const before = projectProgress([done('a'), task('b'), task('c')])
    const after = projectProgress([done('a'), task('b'), task('c', { status: 'ARCHIVED' })])

    expect(before).toMatchObject({ total: 3, completed: 1 })
    expect(after).toMatchObject({ total: 2, completed: 1, remaining: 1, percent: 50 })
  })

  it('honours archivedAt even when the status says otherwise', () => {
    const progress = projectProgress([done('a'), task('b', { archivedAt: NOW })])
    expect(progress).toEqual({ total: 1, completed: 1, remaining: 0, percent: 100 })
  })

  it('counts BACKLOG as remaining work rather than hiding it', () => {
    const progress = projectProgress([done('a'), task('b', { status: 'BACKLOG' })])
    expect(progress).toMatchObject({ total: 2, completed: 1, percent: 50 })
  })

  it('reaches 100 only when every countable task is done', () => {
    expect(projectProgress([done('a'), done('b')]).percent).toBe(100)
    expect(projectProgress([done('a'), task('b', { status: 'BLOCKED' })]).percent).toBe(50)
  })
})

describe('openTaskCount', () => {
  it('counts only what can be started right now', () => {
    const statuses: TaskStatus[] = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'BACKLOG', 'DONE', 'ARCHIVED']
    const tasks = statuses.map((status, index) => task(`t${index}`, { status }))
    expect(openTaskCount(tasks)).toBe(2)
  })
})

// ── Grouping ──────────────────────────────────────────────────────────────────

describe('groupByMilestone', () => {
  it('orders groups by milestone position, with unassigned last', () => {
    const groups = groupByMilestone(
      [task('a', { milestoneId: 'm2' }), task('b'), task('c', { milestoneId: 'm1' })],
      [milestone('m2', 2000), milestone('m1', 1000)],
    )

    expect(groups.map((group) => group.milestone?.id ?? null)).toEqual(['m1', 'm2', null])
  })

  it('keeps empty milestones visible', () => {
    // A milestone you just created has no tasks. Hiding it would look like the
    // create failed.
    const groups = groupByMilestone([], [milestone('m1', 1000)])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.tasks).toEqual([])
    expect(groups[0]?.progress.percent).toBe(0)
  })

  it('omits the unassigned group when everything is filed', () => {
    const groups = groupByMilestone([task('a', { milestoneId: 'm1' })], [milestone('m1', 1000)])
    expect(groups.map((group) => group.milestone?.id ?? null)).toEqual(['m1'])
  })

  it('sorts finished tasks beneath open ones inside a group', () => {
    const groups = groupByMilestone(
      [
        done('finished', { milestoneId: 'm1', position: 100 }),
        task('open', { milestoneId: 'm1', position: 900 }),
      ],
      [milestone('m1', 1000)],
    )
    expect(groups[0]?.tasks.map((t) => t.id)).toEqual(['open', 'finished'])
  })

  it('drops archived tasks from the screen entirely', () => {
    const groups = groupByMilestone(
      [task('a', { milestoneId: 'm1' }), task('b', { milestoneId: 'm1', status: 'ARCHIVED' })],
      [milestone('m1', 1000)],
    )
    expect(groups[0]?.tasks.map((t) => t.id)).toEqual(['a'])
  })

  it('gives each group its own progress', () => {
    const groups = groupByMilestone(
      [
        done('a', { milestoneId: 'm1' }),
        task('b', { milestoneId: 'm1' }),
        task('c', { milestoneId: 'm2' }),
      ],
      [milestone('m1', 1000), milestone('m2', 2000)],
    )
    expect(groups[0]?.progress.percent).toBe(50)
    expect(groups[1]?.progress.percent).toBe(0)
  })

  it('is deterministic when two milestones share a position', () => {
    const a = groupByMilestone([], [milestone('m-b', 1000), milestone('m-a', 1000)])
    const b = groupByMilestone([], [milestone('m-a', 1000), milestone('m-b', 1000)])
    expect(a.map((g) => g.milestone?.id)).toEqual(b.map((g) => g.milestone?.id))
  })
})

describe('currentMilestone', () => {
  const milestones = [milestone('m1', 1000, 'Authentication'), milestone('m2', 2000, 'Dashboard')]

  it('is the milestone holding the next task', () => {
    const groups = groupByMilestone(
      [done('a', { milestoneId: 'm1' }), task('b', { milestoneId: 'm2' })],
      milestones,
    )
    expect(currentMilestone(groups, 'b')?.title).toBe('Dashboard')
  })

  it('falls back to the earliest unfinished milestone when the next task is unfiled', () => {
    const groups = groupByMilestone(
      [task('loose'), task('b', { milestoneId: 'm2' }), task('c', { milestoneId: 'm1' })],
      milestones,
    )
    expect(currentMilestone(groups, 'loose')?.title).toBe('Authentication')
  })

  it('is null when every milestone is finished', () => {
    const groups = groupByMilestone(
      [done('a', { milestoneId: 'm1' }), done('b', { milestoneId: 'm2' })],
      milestones,
    )
    expect(currentMilestone(groups, null)).toBeNull()
  })

  it('is null when the project has no milestones', () => {
    expect(currentMilestone(groupByMilestone([task('a')], []), 'a')).toBeNull()
  })
})

// ── Project-scoped next action ────────────────────────────────────────────────

describe('nextActionForProject', () => {
  it('never disagrees with Today about a task they both see', () => {
    // The guarantee: if the global next action belongs to project P, then P's own
    // page proposes exactly that task. Anything else is the bug this test exists
    // to prevent — two screens telling you to do different things.
    const tasks = [
      task('p1-a', { projectId: 'p1', position: 2000 }),
      task('p1-b', { projectId: 'p1', position: 1000, priority: 'HIGH' }),
      task('p2-a', { projectId: 'p2', dueDate: '2026-10-01' }),
    ]
    const projects = [project('p1'), project('p2')]
    const global = pickNextAction(input(tasks, projects))

    expect(global).toMatchObject({ kind: 'TASK' })
    if (global.kind !== 'TASK') return

    // The overdue task in p2 wins globally…
    expect(global.task.id).toBe('p2-a')
    // …and p2's own page agrees.
    expect(nextActionForProject(input(tasks, projects), 'p2')).toMatchObject({
      kind: 'TASK',
      task: { id: 'p2-a' },
    })
    // p1 proposes p1's best, which is a legitimate difference: a narrower list,
    // not a different rule.
    expect(nextActionForProject(input(tasks, projects), 'p1')).toMatchObject({
      kind: 'TASK',
      task: { id: 'p1-b' },
    })
  })

  it('applies the same ordering rules the global pick uses', () => {
    const tasks = [
      task('later', { projectId: 'p1', position: 2000 }),
      task('overdue', { projectId: 'p1', position: 9000, dueDate: '2026-10-01' }),
      task('running', { projectId: 'p1', position: 9999, status: 'IN_PROGRESS' }),
    ]
    // IN_PROGRESS first — "finish what you started" is rule one everywhere.
    expect(nextActionForProject(input(tasks, [project('p1')]), 'p1')).toMatchObject({
      task: { id: 'running' },
    })
  })

  it('ignores a live session belonging to another project', () => {
    const tasks = [
      task('mine', { projectId: 'p1' }),
      task('elsewhere', { projectId: 'p2', status: 'IN_PROGRESS' }),
    ]
    const live: FocusSession = {
      id: 's1',
      taskId: 'elsewhere',
      plannedMinutes: 60,
      status: 'STARTED',
      startedAt: NOW,
      lastResumedAt: NOW,
      accumulatedSeconds: 0,
      endedAt: null,
      dodSnapshot: 'something',
      pauseCount: 0,
    }

    const result = nextActionForProject(input(tasks, [project('p1'), project('p2')], live), 'p1')
    expect(result).toMatchObject({ kind: 'TASK', task: { id: 'mine' }, intent: 'START' })
  })

  it('offers RESUME when the live session is on this project', () => {
    const tasks = [task('mine', { projectId: 'p1', status: 'IN_PROGRESS' })]
    const live: FocusSession = {
      id: 's1',
      taskId: 'mine',
      plannedMinutes: 60,
      status: 'PAUSED',
      startedAt: NOW,
      lastResumedAt: null,
      accumulatedSeconds: 120,
      endedAt: null,
      dodSnapshot: 'something',
      pauseCount: 1,
    }
    expect(nextActionForProject(input(tasks, [project('p1')], live), 'p1')).toMatchObject({
      intent: 'RESUME',
      task: { id: 'mine' },
    })
  })

  it('proposes nothing for an archived project', () => {
    // Inherited from pickNextAction rather than re-stated here, which is the
    // point: archive behaviour cannot drift between the two screens.
    const tasks = [task('a', { projectId: 'p1' })]
    const projects = [project('p1', { status: 'ARCHIVED' })]

    expect(nextActionForProject(input(tasks, projects), 'p1')).toMatchObject({ kind: 'NONE' })
    expect(pickNextAction(input(tasks, projects))).toMatchObject({ kind: 'NONE' })
  })

  it('reports ALL_DONE for a finished project', () => {
    const tasks = [done('a', { projectId: 'p1' })]
    expect(nextActionForProject(input(tasks, [project('p1')]), 'p1')).toEqual({
      kind: 'NONE',
      reason: 'ALL_DONE',
    })
  })

  it('reports NO_TASKS for an empty project', () => {
    expect(nextActionForProject(input([], [project('p1')]), 'p1')).toEqual({
      kind: 'NONE',
      reason: 'NO_TASKS',
    })
  })

  it('does not let one project’s tasks explain another’s emptiness', () => {
    const tasks = [task('blocked-elsewhere', { projectId: 'p2', status: 'BLOCKED' })]
    const projects = [project('p1'), project('p2')]
    expect(nextActionForProject(input(tasks, projects), 'p1')).toEqual({
      kind: 'NONE',
      reason: 'NO_TASKS',
    })
    expect(nextActionForProject(input(tasks, projects), 'p2')).toEqual({
      kind: 'NONE',
      reason: 'ALL_BLOCKED',
    })
  })

  it('leaves standalone tasks out of every project', () => {
    // Standalone tasks normally sort *ahead* of project work globally, so this
    // also proves the filter runs before the ordering rather than after it.
    const candidates = [task('loose'), task('filed', { projectId: 'p1' })]
    expect(nextActionForProject(input(candidates, [project('p1')]), 'p1')).toMatchObject({
      task: { id: 'filed' },
    })
  })
})
