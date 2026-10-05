import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Next 16 renamed the `middleware` convention to `proxy` (same behaviour, and it
 * now always runs on the Node runtime — which suits Supabase SSR well).
 */
export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  // Everything except static assets and image optimisation. Without the negative
  // match, auth gating would also intercept CSS, JS and icons.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|.*\\.(?:png|svg|ico|webmanifest)$).*)'],
}
