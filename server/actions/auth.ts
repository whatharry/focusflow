'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { siteUrl } from '@/lib/env'

/**
 * Authentication actions.
 *
 * Every one returns a plain `{ error }` shape rather than throwing, so the forms
 * can show the user something true. "Wrong password" must look like wrong
 * password, not like a crash.
 */

export interface ActionResult {
  error?: string
}

const emailSchema = z.string().trim().min(1, 'Enter your email address.').email('That does not look like an email address.')

/**
 * 10 characters, no composition theatre. Length beats mandatory punctuation, and
 * a rule you resent is a rule you work around.
 */
const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters — length matters more than symbols.')
  .max(200, 'That password is longer than it needs to be.')

const COMMON_PASSWORDS = new Set([
  'password12',
  'password123',
  '1234567890',
  'qwertyuiop',
  'letmein123',
  'iloveyou12',
  'welcome123',
  'focusflow1',
  'focusflow123',
  'adminadmin',
])

const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
})

function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Something in that form is not valid.'
}

export async function signUp(formData: FormData): Promise<ActionResult> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: firstError(parsed.error) }

  const { email, password } = parsed.data
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { error: 'That password is too common. Pick something only you would think of.' }
  }

  const displayName = String(formData.get('display_name') ?? '').trim()
  // The browser knows the timezone; the server does not. Captured at signup so
  // "today" means today where the user is from their very first session.
  const timezone = String(formData.get('timezone') ?? '').trim()

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        ...(displayName ? { display_name: displayName } : {}),
        ...(timezone ? { timezone } : {}),
      },
    },
  })

  if (error) return { error: humaniseAuthError(error.message) }

  revalidatePath('/', 'layout')
  redirect('/today')
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const email = emailSchema.safeParse(formData.get('email'))
  if (!email.success) return { error: firstError(email.error) }

  const password = String(formData.get('password') ?? '')
  if (password.length === 0) return { error: 'Enter your password.' }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: email.data,
    password,
  })

  if (error) return { error: humaniseAuthError(error.message) }

  const next = String(formData.get('next') ?? '')
  revalidatePath('/', 'layout')
  redirect(isSafeNext(next) ? next : '/today')
}

export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const email = emailSchema.safeParse(formData.get('email'))
  if (!email.success) return { error: firstError(email.error) }

  const requestHeaders = await headers()
  const origin = requestHeaders.get('origin') ?? `https://${requestHeaders.get('host') ?? ''}`

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email.data, {
    // Through the callback route, which redeems the PKCE code for a session
    // before the user ever sees the new-password form.
    redirectTo: `${siteUrl(origin)}/auth/callback?next=/reset/confirm`,
  })

  // Deliberately not surfaced per-address: whether an account exists is not
  // information this form should hand out.
  if (error && !/user not found/i.test(error.message)) {
    return { error: humaniseAuthError(error.message) }
  }
  return {}
}

export async function updatePassword(formData: FormData): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(formData.get('password'))
  if (!parsed.success) return { error: firstError(parsed.error) }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'That reset link has expired. Request a new one and try again.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data })
  if (error) return { error: humaniseAuthError(error.message) }

  revalidatePath('/', 'layout')
  redirect('/today')
}

/** Only same-origin relative paths may be used as a post-login destination. */
function isSafeNext(next: string): boolean {
  return next.startsWith('/') && !next.startsWith('//')
}

/** Supabase messages are accurate but terse; these are the ones users will hit. */
function humaniseAuthError(message: string): string {
  const text = message.toLowerCase()
  if (text.includes('invalid login credentials')) {
    return 'That email and password do not match. Try again.'
  }
  if (text.includes('email not confirmed')) {
    return 'This address still needs confirming. Check your email, or turn off email confirmation in your Supabase project.'
  }
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'There is already an account with that email. Sign in instead.'
  }
  if (text.includes('rate limit') || text.includes('too many requests')) {
    return 'Too many attempts just now. Wait a minute and try again.'
  }
  if (text.includes('password should be at least')) {
    return 'Your Supabase project requires a longer password than that.'
  }
  if (text.includes('signups not allowed') || text.includes('signup is disabled')) {
    return 'Sign-ups are disabled for this Supabase project. Enable them in Authentication → Sign In / Providers.'
  }
  return message
}
