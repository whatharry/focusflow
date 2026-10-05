import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Exchanges the one-time `code` from an emailed link (password recovery) for a
 * session, then forwards to wherever the link was meant to land.
 *
 * `@supabase/ssr` uses the PKCE flow, so the email link carries a code to be
 * redeemed server-side rather than a session in the URL fragment. Without this
 * route, reset links sign nobody in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next')
  const destination = next && next.startsWith('/') && !next.startsWith('//') ? next : '/today'

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=link_invalid', origin))
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(new URL('/login?error=link_expired', origin))
  }

  return NextResponse.redirect(new URL(destination, origin))
}
