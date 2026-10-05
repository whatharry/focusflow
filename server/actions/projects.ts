'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Project writes — Phase 1 needs only enough to give tasks somewhere to live.
 * Cards, milestones, health and project detail are later phases.
 */

export interface ProjectActionResult {
  error?: string
}

const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the project a name.')
    .max(120, 'That name is longer than a project name needs to be.'),
})

export async function createProject(formData: FormData): Promise<ProjectActionResult> {
  const parsed = createProjectSchema.safeParse({ name: formData.get('name') })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That project could not be saved.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired. Sign in again.' }

  // Append to the end. Positions are assigned here rather than by a database
  // default because ordering is a product decision, not a storage detail.
  const { data: last } = await supabase
    .from('projects')
    .select('position')
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('projects').insert({
    user_id: user.id,
    name: parsed.data.name,
    position: (last?.position ?? -1) + 1,
  })

  if (error) return { error: `Could not save that project: ${error.message}` }

  revalidatePath('/projects')
  revalidatePath('/today')
  return {}
}
