'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Project writes.
 *
 * Archiving is the only way to remove a project from view. There is no delete:
 * a project owns tasks, and tasks own focus sessions — hours you actually spent.
 * Deleting the project would cascade that history away, and no amount of "are you
 * sure?" makes destroying a record of real work a reasonable default.
 */

export interface ProjectActionResult {
  error?: string
}

const nameSchema = z
  .string()
  .trim()
  .min(1, 'Give the project a name.')
  .max(120, 'That name is longer than a project name needs to be.')

const descriptionSchema = z
  .string()
  .trim()
  .max(500, 'Shorter is better — this is a reminder, not a brief.')
  .transform((value) => (value === '' ? null : value))

const createProjectSchema = z.object({
  name: nameSchema,
  description: descriptionSchema,
})

const updateProjectSchema = createProjectSchema.extend({
  id: z.string().uuid('That project could not be found.'),
})

function revalidateProjectScreens(projectId?: string): void {
  revalidatePath('/projects')
  revalidatePath('/today')
  if (projectId) revalidatePath(`/projects/${projectId}`)
}

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function createProject(formData: FormData): Promise<ProjectActionResult> {
  const parsed = createProjectSchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That project could not be saved.' }
  }

  const userId = await requireUserId()
  if (!userId) return { error: 'Your session expired. Sign in again.' }

  const supabase = await createClient()

  // Append to the end. Positions are assigned here rather than by a database
  // default because ordering is a product decision, not a storage detail.
  const { data: last } = await supabase
    .from('projects')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('projects').insert({
    user_id: userId,
    name: parsed.data.name,
    description: parsed.data.description,
    position: (last?.position ?? -1) + 1,
  })

  if (error) return { error: `Could not save that project: ${error.message}` }

  revalidateProjectScreens()
  return {}
}

export async function updateProject(formData: FormData): Promise<ProjectActionResult> {
  const parsed = updateProjectSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    description: formData.get('description') ?? '',
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That project could not be saved.' }
  }

  const supabase = await createClient()
  // No user_id predicate: RLS already makes another user's row invisible to both
  // the USING and the WITH CHECK clause, so a mismatched id updates nothing.
  const { data, error } = await supabase
    .from('projects')
    .update({ name: parsed.data.name, description: parsed.data.description })
    .eq('id', parsed.data.id)
    .select('id')
    .maybeSingle()

  if (error) return { error: `Could not save that project: ${error.message}` }
  if (!data) return { error: 'That project no longer exists.' }

  revalidateProjectScreens(parsed.data.id)
  return {}
}

/**
 * Archive a project.
 *
 * Nothing is deleted and nothing moves. The only consequence is that
 * `pickNextAction` stops treating the project as active, which removes its tasks
 * from Today — a rule that already lived in core/ before Phase 2 and is inherited
 * here rather than re-implemented.
 */
export async function archiveProject(projectId: string): Promise<ProjectActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .update({ status: 'ARCHIVED', archived_at: new Date().toISOString() })
    .eq('id', projectId)
    .select('id')
    .maybeSingle()

  if (error) return { error: `Could not archive that project: ${error.message}` }
  if (!data) return { error: 'That project no longer exists.' }

  revalidateProjectScreens(projectId)
  return {}
}

export async function restoreProject(projectId: string): Promise<ProjectActionResult> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('projects')
    .update({ status: 'ACTIVE', archived_at: null })
    .eq('id', projectId)
    .select('id')
    .maybeSingle()

  if (error) return { error: `Could not restore that project: ${error.message}` }
  if (!data) return { error: 'That project no longer exists.' }

  revalidateProjectScreens(projectId)
  return {}
}
