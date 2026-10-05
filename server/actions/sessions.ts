'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isSessionDurationOption, SESSION_DURATION_OPTIONS } from '@/core/types'
import { createClient } from '@/lib/supabase/server'
import { touchProject } from '@/server/actions/tasks'

/**
 * Starting a focus session.
 *
 * The Definition of Done is required. That is the strongest version of the
 * product's own philosophy: if you cannot say what finishing looks like, the
 * "Finish" button later on would be meaningless. It is pre-filled from the task
 * on every subsequent session, so the requirement never becomes a retyping tax.
 */

export interface StartSessionResult {
  error?: string
  /** Set when a session is already running: the UI redirects there instead. */
  liveSessionId?: string
}

const MIN_DOD_LENGTH = 10

const startSchema = z.object({
  taskId: z.string().uuid('That task could not be found.'),
  definitionOfDone: z
    .string()
    .trim()
    .min(1, 'Describe what DONE looks like before you start.')
    .min(
      MIN_DOD_LENGTH,
      'Be a little more concrete — what will be true when this is finished?',
    )
    .max(500, 'Shorter is better. One sentence is plenty.'),
  plannedMinutes: z
    .number()
    .refine(isSessionDurationOption, `Pick one of ${SESSION_DURATION_OPTIONS.join(', ')} minutes.`),
})

export async function startSession(formData: FormData): Promise<StartSessionResult> {
  const parsed = startSchema.safeParse({
    taskId: String(formData.get('task_id') ?? ''),
    definitionOfDone: String(formData.get('definition_of_done') ?? ''),
    plannedMinutes: Number(formData.get('planned_minutes')),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That session could not be started.' }
  }

  const { taskId, definitionOfDone, plannedMinutes } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired. Sign in again.' }

  // Resuming beats starting: if something is already running, go back to it
  // rather than silently opening a second one.
  const existing = await findLiveSessionId()
  if (existing) return { liveSessionId: existing }

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, project_id, status')
    .eq('id', taskId)
    .maybeSingle()
  if (taskError) return { error: `Could not load that task: ${taskError.message}` }
  if (!task) return { error: 'That task no longer exists.' }

  // Server time, never the browser's. Every elapsed figure is a difference
  // between stored timestamps, so the client clock cannot influence the record.
  const startedAt = new Date().toISOString()

  const { data: session, error } = await supabase
    .from('focus_sessions')
    .insert({
      user_id: user.id,
      task_id: taskId,
      planned_minutes: plannedMinutes,
      dod_snapshot: definitionOfDone,
      status: 'STARTED',
      started_at: startedAt,
      last_resumed_at: startedAt,
      accumulated_seconds: 0,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 from focus_sessions_one_live_per_user: another device or a double
    // submit got there first. Join that session instead of failing.
    if (error.code === '23505') {
      const live = await findLiveSessionId()
      if (live) return { liveSessionId: live }
      return { error: 'A focus session is already running. Reload and resume it.' }
    }
    return { error: `Could not start the session: ${error.message}` }
  }

  // Persist the DoD onto the task so the next session pre-fills it, and mark the
  // task as being worked on so it ranks first until it is finished.
  await supabase
    .from('tasks')
    .update({ definition_of_done: definitionOfDone, status: 'IN_PROGRESS' })
    .eq('id', taskId)

  if (task.project_id) await touchProject(task.project_id)

  revalidatePath('/today')
  revalidatePath('/projects')
  redirect(`/focus/${session.id}`)
}

/** The id of the user's live session, if any. */
export async function findLiveSessionId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('focus_sessions')
    .select('id')
    .in('status', ['STARTED', 'PAUSED'])
    .maybeSingle()
  return data?.id ?? null
}
