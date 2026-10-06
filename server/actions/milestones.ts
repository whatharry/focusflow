'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Milestone writes.
 *
 * A milestone is a heading with an order and nothing else — no dates, no status,
 * no description. Its completeness is a function of its tasks, computed in
 * `core/project-structure.ts`. Storing a second answer would let the two drift,
 * and the stored one would always be the stale one.
 *
 * Positions use gaps of 1000 so a future drag-and-drop can insert between two
 * rows with (a+b)/2. Phase 2 only moves things one step at a time, which is a
 * swap and needs no gap at all — but renumbering later is the kind of migration
 * worth not needing.
 */

export interface MilestoneActionResult {
  error?: string
}

const POSITION_GAP = 1000

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Give the milestone a name.')
  .max(120, 'That name is longer than a milestone name needs to be.')

const createSchema = z.object({
  projectId: z.string().uuid('That project could not be found.'),
  title: titleSchema,
})

const renameSchema = z.object({
  id: z.string().uuid('That milestone could not be found.'),
  title: titleSchema,
})

function revalidateProject(projectId: string): void {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/projects')
  revalidatePath('/today')
}

export async function createMilestone(formData: FormData): Promise<MilestoneActionResult> {
  const parsed = createSchema.safeParse({
    projectId: formData.get('project_id'),
    title: formData.get('title'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That milestone could not be saved.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired. Sign in again.' }

  const { data: last } = await supabase
    .from('milestones')
    .select('position')
    .eq('project_id', parsed.data.projectId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('milestones').insert({
    user_id: user.id,
    project_id: parsed.data.projectId,
    title: parsed.data.title,
    position: (last?.position ?? 0) + POSITION_GAP,
  })

  // 23503: the composite foreign key refused the project. Either it does not
  // exist or it is not this user's — and the two must read the same, so the
  // message never reveals which.
  if (error) {
    if (error.code === '23503') return { error: 'That project could not be found.' }
    return { error: `Could not save that milestone: ${error.message}` }
  }

  revalidateProject(parsed.data.projectId)
  return {}
}

export async function renameMilestone(formData: FormData): Promise<MilestoneActionResult> {
  const parsed = renameSchema.safeParse({
    id: formData.get('id'),
    title: formData.get('title'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'That milestone could not be saved.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('milestones')
    .update({ title: parsed.data.title })
    .eq('id', parsed.data.id)
    .select('project_id')
    .maybeSingle()

  if (error) return { error: `Could not rename that milestone: ${error.message}` }
  if (!data) return { error: 'That milestone no longer exists.' }

  revalidateProject(data.project_id)
  return {}
}

/**
 * Move a milestone one place up or down within its project.
 *
 * Implemented as a swap of two positions rather than a renumber, so it touches
 * exactly two rows and cannot disturb anything else's order.
 */
export async function moveMilestone(
  milestoneId: string,
  direction: 'up' | 'down',
): Promise<MilestoneActionResult> {
  const supabase = await createClient()

  const { data: current, error: readError } = await supabase
    .from('milestones')
    .select('id, project_id, position')
    .eq('id', milestoneId)
    .maybeSingle()

  if (readError) return { error: `Could not move that milestone: ${readError.message}` }
  if (!current) return { error: 'That milestone no longer exists.' }

  // The adjacent milestone in the chosen direction, if there is one.
  const { data: neighbour } = await supabase
    .from('milestones')
    .select('id, position')
    .eq('project_id', current.project_id)
    .neq('id', current.id)
    [direction === 'up' ? 'lt' : 'gt']('position', current.position)
    .order('position', { ascending: direction !== 'up' })
    .limit(1)
    .maybeSingle()

  // Already at the end. Not an error — the button simply had nothing to do.
  if (!neighbour) return {}

  const [first, second] = await Promise.all([
    supabase.from('milestones').update({ position: neighbour.position }).eq('id', current.id),
    supabase.from('milestones').update({ position: current.position }).eq('id', neighbour.id),
  ])

  const error = first.error ?? second.error
  if (error) return { error: `Could not move that milestone: ${error.message}` }

  revalidateProject(current.project_id)
  return {}
}

/**
 * Delete a milestone.
 *
 * Safe by construction rather than by convention: `tasks_milestone_owner_fkey`
 * is `on delete set null (milestone_id)`, so the tasks underneath lose their
 * heading and keep everything else — including their project. A milestone holds
 * no data of its own beyond its name, so there is nothing else to lose.
 */
export async function deleteMilestone(milestoneId: string): Promise<MilestoneActionResult> {
  const supabase = await createClient()

  const { data: milestone } = await supabase
    .from('milestones')
    .select('project_id')
    .eq('id', milestoneId)
    .maybeSingle()

  const { error } = await supabase.from('milestones').delete().eq('id', milestoneId)
  if (error) return { error: `Could not delete that milestone: ${error.message}` }

  if (milestone) revalidateProject(milestone.project_id)
  return {}
}
