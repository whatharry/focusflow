'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

/**
 * Profile writes. The timezone matters more than it looks: every "today" in the
 * app is resolved through it, so a wrong value silently misfiles evening work.
 */

export interface ProfileActionResult {
  error?: string
  saved?: boolean
}

/** Validates against the runtime's own timezone database rather than a hardcoded list. */
function isKnownTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value })
    return true
  } catch {
    return false
  }
}

const profileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(80, 'That name is longer than a name needs to be.')
    .transform((value) => (value === '' ? null : value)),
  timezone: z
    .string()
    .trim()
    .min(1, 'Choose a timezone.')
    .refine(isKnownTimeZone, 'That is not a timezone this browser recognises.'),
})

export async function updateProfile(formData: FormData): Promise<ProfileActionResult> {
  const parsed = profileSchema.safeParse({
    displayName: formData.get('display_name'),
    timezone: formData.get('timezone'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Those settings could not be saved.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your session expired. Sign in again.' }

  const { error } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data.displayName, timezone: parsed.data.timezone })
    .eq('id', user.id)

  if (error) return { error: `Could not save those settings: ${error.message}` }

  revalidatePath('/settings')
  revalidatePath('/today')
  return { saved: true }
}
