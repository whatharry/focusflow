'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { TASK_PRIORITIES, TASK_STATUSES } from '@/core/types'
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

function optionalText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? '').trim()
  return text === '' ? null : text
}

/** Both project detail screens a task can touch, plus the two list screens. */
function revalidateTaskScreens(...projectIds: (string | null)[]): void {
  revalidatePath('/today')
  revalidatePath('/projects')
  for (const id of new Set(projectIds.filter((id): id is string => id !== null))) {
    revalidatePath(`/projects/${id}`)
  }
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

/**
 * Full task edit.
 *
 * The editor is deliberately a superset of Quick Add rather than a different
 * model: same row, same columns, more of them exposed. Everything except the
 * title stays optional, because a task that cannot be saved until it is fully
 * specified is a task you will not capture.
 *
 * Two couplings the database insists on, handled here so the user never meets a
 * constraint error:
 *
 *  • A milestone requires a project (`tasks_milestone_requires_project`), so
 *    clearing the project clears the milestone too.
 *  • A milestone must belong to the task's own project
 *    (`tasks_milestone_project_fkey`), so changing project drops a milestone
 *    that no longer applies rather than carrying it across.
 */
const updateTaskSchema = z.object({
  id: z.string().uuid('That task could not be found.'),
  title: z
    .string()
    .trim()
    .min(1, 'Give the task a title.')
    .max(200, 'That title is longer than a task title needs to be.'),
  description: z
    .string()
    .trim()
    .max(2000, 'That is long enough to be its own task.')
    .transform((value) => (value === '' ? null : value)),
  definitionOfDone: z
    .string()
    .trim()
    .max(500, 'Shorter is better. One sentence is plenty.')
    .transform((value) => (value === '' ? null : value)),
  estimateMinutes: z
    .number()
    .int()
    .min(5, 'Estimates start at 5 minutes.')
    .max(600, 'Anything over 10 hours is a project, not a task.')
    .nullable(),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'That date could not be read.')
    .nullable(),
  status: z.enum(TASK_STATUSES).refine((value) => value !== 'ARCHIVED', {
    message: 'Use archive rather than setting that status directly.',
  }),
  projectId: z.string().uuid().nullable(),
  milestoneId: z.string().uuid().nullable(),
})

export async function updateTask(formData: FormData): Promise<TaskActionResult> {
  const parsed = updateTaskSchema.safeParse({
    id: formData.get('id'),
    title: formData.get('title'),
    description: formData.get('description') ?? '',
    definitionOfDone: formData.get('definition_of_done') ?? '',
    estimateMinutes: optionalNumber(formData.get('estimate_minutes')),
    priority: formData.get('priority') ?? 'NORMAL',
    dueDate: optionalText(formData.get('due_date')),
    status: formData.get('status') ?? 'TODO',
    projectId: optionalUuid(formData.get('project_id')),
    milestoneId: optionalUuid(formData.get('milestone_id')),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That task could not be saved.' }
  }

  const supabase = await createClient()
  const { data: existing, error: readError } = await supabase
    .from('tasks')
    .select('status, completed_at, project_id')
    .eq('id', parsed.data.id)
    .maybeSingle()

  if (readError) return { error: `Could not load that task: ${readError.message}` }
  if (!existing) return { error: 'That task no longer exists.' }

  const { projectId } = parsed.data
  // A milestone only survives if it still has a project to belong to, and the
  // client is not trusted to have worked that out.
  const milestoneId = projectId === null ? null : parsed.data.milestoneId

  // `tasks_done_has_completed_at` means a DONE task must carry a timestamp. Keep
  // the original one when the task was already done, so editing a finished task
  // does not quietly move it into today's wins.
  const becomingDone = parsed.data.status === 'DONE'
  const completedAt = becomingDone
    ? (existing.completed_at ?? new Date().toISOString())
    : null

  const { error } = await supabase
    .from('tasks')
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      definition_of_done: parsed.data.definitionOfDone,
      estimate_minutes: parsed.data.estimateMinutes,
      priority: parsed.data.priority,
      due_date: parsed.data.dueDate,
      status: parsed.data.status,
      project_id: projectId,
      milestone_id: milestoneId,
      completed_at: completedAt,
    })
    .eq('id', parsed.data.id)

  if (error) {
    // 23503 is the composite foreign key refusing a project or milestone that is
    // not this user's, or a milestone from a different project.
    if (error.code === '23503') {
      return { error: 'That project or milestone could not be found.' }
    }
    return { error: `Could not save that task: ${error.message}` }
  }

  // Both ends of a move count as activity, so neither project looks stale.
  if (existing.project_id) await touchProject(existing.project_id)
  if (projectId && projectId !== existing.project_id) await touchProject(projectId)

  revalidateTaskScreens(existing.project_id, projectId)
  return {}
}

/**
 * Archive a task: out of every list, still in the record.
 *
 * Its focus sessions are untouched, so the hours stay counted on the days they
 * were worked. This is the only "delete" the product offers.
 */
export async function archiveTask(taskId: string): Promise<TaskActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'ARCHIVED', archived_at: new Date().toISOString() })
    .eq('id', taskId)
    .select('project_id')
    .maybeSingle()

  if (error) return { error: `Could not archive that task: ${error.message}` }
  if (!data) return { error: 'That task no longer exists.' }

  revalidateTaskScreens(data.project_id, null)
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
