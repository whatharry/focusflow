import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/env'
import type { Database } from './database.types'

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 *
 * A fresh client per request — never shared. In a Server Component cookies cannot
 * be written, so `setAll` is allowed to fail silently: the proxy has already
 * refreshed the session for this navigation.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where the response is already
          // streaming. Harmless: proxy.ts refreshes the session instead.
        }
      },
    },
  })
}

/**
 * The signed-in user, or null.
 *
 * `getUser()` rather than `getSession()`: it validates the token with the auth
 * server instead of trusting a cookie that a client could have tampered with.
 */
export async function getCurrentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}
