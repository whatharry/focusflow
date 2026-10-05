import { notFound, redirect } from 'next/navigation'
import { toLocalDate } from '@/core/date'
import { pickNextAction } from '@/core/next-action'
import { tasksCompletedOn } from '@/core/progress'
import type { FocusSession } from '@/core/types'
import { createClient } from '@/lib/supabase/server'
import { toFocusSession, toProject, toTaskCandidate } from '@/server/mappers'
import { getViewer } from '@/server/queries/today'

/**
 * Read model for /focus/[sessionId].
 *
 * Reloading mid-session lands here, so the server is the authority: the timer is
 * rebuilt from the stored row, never from anything the client remembered.
 */
export interface FocusView {
  session: FocusSession
  serverNow: number
  taskTitle: string
  projectName: string | null
  /** What to offer in the completion moment's "Continue". */
  nextTask: { id: string; title: string } | null
  tasksCompletedToday: number
}

export async function getFocusView(sessionId: string): Promise<FocusView> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')

  const supabase = await createClient()

  const { data: sessionRow, error } = await supabase
    .from('focus_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle()

  if (error) throw new Error(`Could not load that session: ${error.message}`)
  // RLS makes another user's session invisible, so this is genuinely a 404.
  if (!sessionRow) notFound()

  const session = toFocusSession(sessionRow)

  const [taskResult, projectsResult, tasksResult, milestonesResult] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, title, project_id')
      .eq('id', session.taskId)
      .maybeSingle(),
    supabase.from('projects').select('*').order('position', { ascending: true }),
    supabase.from('tasks').select('*').neq('status', 'ARCHIVED'),
    supabase.from('milestones').select('id, position'),
  ])

  const task = taskResult.data
  if (!task) notFound()

  const projectName =
    task.project_id === null
      ? null
      : ((projectsResult.data ?? []).find((project) => project.id === task.project_id)?.name ??
        null)

  const milestonePositions = new Map(
    (milestonesResult.data ?? []).map((row) => [row.id, row.position] as const),
  )
  const tasks = (tasksResult.data ?? []).map((row) => toTaskCandidate(row, milestonePositions))
  const projects = (projectsResult.data ?? []).map(toProject)

  const now = Date.now()
  const today = toLocalDate(now, viewer.timeZone)

  // What comes after this one — computed with the current task excluded, since
  // finishing it is the premise of the question.
  const remaining = tasks.filter((task) => task.id !== session.taskId)
  const after = pickNextAction({
    tasks: remaining,
    projects,
    plan: null,
    liveSession: null,
    today,
    now,
  })

  return {
    session,
    serverNow: now,
    taskTitle: task.title,
    projectName,
    nextTask: after.kind === 'TASK' ? { id: after.task.id, title: after.task.title } : null,
    tasksCompletedToday: tasksCompletedOn(tasks, today, viewer.timeZone).length,
  }
}
