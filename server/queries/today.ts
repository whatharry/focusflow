import { greetingForHour, toLocalDate, toLocalHour } from '@/core/date'
import { pickNextAction, rankStartableTasks, type NextAction, type TaskCandidate } from '@/core/next-action'
import { dailyProgress, tasksCompletedOn, type DailyProgress } from '@/core/progress'
import type { FocusSession, LocalDate, Project, Task } from '@/core/types'
import { createClient } from '@/lib/supabase/server'
import { toFocusSession, toProject, toTaskCandidate } from '@/server/mappers'

/**
 * Read model for the Today screen — one query per table, assembled and then handed
 * to the pure functions in core/ to decide what it all means.
 *
 * Shaped as a single read model rather than per-component fetches so Today renders
 * in one server round trip. The screen has two seconds to answer "what now?".
 */

export interface TodayView {
  greeting: string
  displayName: string | null
  timeZone: string
  today: LocalDate
  now: number
  nextAction: NextAction
  /** The task of a STARTED/PAUSED session, if one exists. */
  liveSession: FocusSession | null
  /** Startable work after the next action, for the small "upcoming" section. */
  upcoming: TaskCandidate[]
  upcomingTotal: number
  wins: Task[]
  progress: DailyProgress
  projects: Project[]
}

export interface Viewer {
  id: string
  email: string | null
  displayName: string | null
  timeZone: string
}

/** Profile for the signed-in user, falling back sanely if the row is missing. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, timezone')
    .eq('id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: profile?.display_name ?? null,
    timeZone: profile?.timezone ?? 'UTC',
  }
}

const UPCOMING_LIMIT = 3

/**
 * `now` defaults to the server clock. It stays a parameter because every date rule
 * downstream of here is pure and takes the instant as input — and because tests and
 * future scheduled reads need to be able to ask "what would Today say at 23:55?".
 */
export async function getTodayView(viewer: Viewer, now: number = Date.now()): Promise<TodayView> {
  const supabase = await createClient()

  // Four independent reads, issued together. Volumes here are personal-scale, so
  // fetching the working set and reasoning about it in TypeScript is both simpler
  // and more testable than pushing the ordering rules into SQL.
  const [projectsResult, tasksResult, milestonesResult, sessionsResult] = await Promise.all([
    supabase.from('projects').select('*').order('position', { ascending: true }),
    supabase.from('tasks').select('*').neq('status', 'ARCHIVED'),
    supabase.from('milestones').select('id, position'),
    supabase
      .from('focus_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(50),
  ])

  const firstError =
    projectsResult.error ?? tasksResult.error ?? milestonesResult.error ?? sessionsResult.error
  if (firstError) throw new Error(`Could not load Today: ${firstError.message}`)

  const milestonePositions = new Map(
    (milestonesResult.data ?? []).map((row) => [row.id, row.position] as const),
  )

  const projects = (projectsResult.data ?? []).map(toProject)
  const tasks = (tasksResult.data ?? []).map((row) => toTaskCandidate(row, milestonePositions))
  const sessions = (sessionsResult.data ?? []).map(toFocusSession)

  const liveSession =
    sessions.find((session) => session.status === 'STARTED' || session.status === 'PAUSED') ?? null

  const today = toLocalDate(now, viewer.timeZone)
  const input = { tasks, projects, plan: null, liveSession, today, now }

  const nextAction = pickNextAction(input)
  const ranked = rankStartableTasks(input)
  const chosenId = nextAction.kind === 'TASK' ? nextAction.task.id : null
  const rest = ranked.filter((task) => task.id !== chosenId)

  return {
    greeting: greetingForHour(toLocalHour(now, viewer.timeZone)),
    displayName: viewer.displayName,
    timeZone: viewer.timeZone,
    today,
    now,
    nextAction,
    liveSession,
    upcoming: rest.slice(0, UPCOMING_LIMIT),
    upcomingTotal: rest.length,
    wins: tasksCompletedOn(tasks, today, viewer.timeZone),
    progress: dailyProgress({ sessions, tasks, date: today, timeZone: viewer.timeZone, now }),
    projects,
  }
}
