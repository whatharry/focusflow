'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Task writes.
 *
 * Capture must cost almost nothing: a title is the only required field. Everything
 * else is optional, and nothing has to be promoted, planned or filed before the
 * task is eligible to become the next action — new tasks are TODO by default.
 */

export interface TaskActionResult {
  error?: string
}

const quickAddSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Give the task a title.')
    .max(200, 'That title is longer than a task title needs to be.'),
  estimateMinutes: z
    .number()
    .int()
    .min(5, 'Estimates start at 5 minutes.')
    .max(600, 'Anything over 10 hours is a project, not a task.')
    .nullable(),
  projectId: z.string().uuid().nullable(),
})

function optionalNumber(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? '').trim()
  if (text === '') return null
  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

function optionalUuid(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

export async function quickAddTask(formData: FormData): Promise<TaskActionResult> {
  const parsed = quickAddSchema.safeParse({
    title: formData.get('title'),
    estimateMinutes: optionalNumber(formData.get('estimate_minutes')),
    projectId: optionalUuid(formData.get('project_id')),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That task could not be saved.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired. Sign in again.' }

  const { title, estimateMinutes, projectId } = parsed.data

  const { error } = await supabase.from('tasks').insert({
    user_id: user.id,
    title,
    estimate_minutes: estimateMinutes,
    project_id: projectId,
    // status defaults to TODO in the database — nothing to promote.
  })

  if (error) return { error: `Could not save that task: ${error.message}` }

  if (projectId) await touchProject(projectId)
  revalidatePath('/today')
  revalidatePath('/projects')
  return {}
}

/** Complete a task from a list, without going through a focus session. */
export async function completeTask(taskId: string): Promise<TaskActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'DONE', completed_at: new Date().toISOString() })
    .eq('id', taskId)
    .select('project_id')
    .maybeSingle()

  if (error) return { error: `Could not complete that task: ${error.message}` }
  if (!data) return { error: 'That task no longer exists.' }

  if (data.project_id) await touchProject(data.project_id)
  revalidatePath('/today')
  revalidatePath('/projects')
  return {}
}

/** Reopen a task completed by mistake. */
export async function reopenTask(taskId: string): Promise<TaskActionResult> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'TODO', completed_at: null })
    .eq('id', taskId)

  if (error) return { error: `Could not reopen that task: ${error.message}` }
  revalidatePath('/today')
  revalidatePath('/projects')
  return {}
}

/** Stop a task being suggested without deleting it. */
export async function demoteTaskToBacklog(taskId: string): Promise<TaskActionResult> {
  const supabase = await createClient()
  const { error } = await supabase.from('tasks').update({ status: 'BACKLOG' }).eq('id', taskId)
  if (error) return { error: `Could not move that task: ${error.message}` }
  revalidatePath('/today')
  revalidatePath('/projects')
  return {}
}

/**
 * Projects show "last activity", which should mean real movement rather than an
 * edit to the project's own name. Called from the task and session paths.
 */
export async function touchProject(projectId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from('projects')
    .update({ last_activity_at: new Date().toISOString() })
    .eq('id', projectId)
}
