import { NextResponse, type NextRequest } from 'next/server'
import { revalidatePath } from 'next/cache'
import {
  planAbandon,
  planFinish,
  planPause,
  planResume,
  planTrimToPlanned,
  type SessionPatch,
} from '@/core/session-timer'
import { createClient } from '@/lib/supabase/server'
import { toFocusSession } from '@/server/mappers'

/**
 * Focus session state transitions.
 *
 * Route Handlers rather than Server Actions, deliberately. Server Actions
 * serialise one-at-a-time per client, are bound to the current route's POST, and
 * cannot be reached from `sendBeacon` or replayed from an offline queue. Focus
 * Mode needs all of those, and a plain POST endpoint is also trivially testable.
 *
 * Every response carries `serverNow` so the client can render the timer with a
 * clock offset applied rather than trusting the device clock.
 */

const ACTIONS = ['pause', 'resume', 'finish', 'abandon', 'trim'] as const
type Action = (typeof ACTIONS)[number]

function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value)
}

export async function POST(_request: NextRequest, context: RouteContext<'/api/sessions/[id]/[action]'>) {
  const { id, action } = await context.params

  if (!isAction(action)) {
    return NextResponse.json({ error: `Unknown action "${action}".` }, { status: 404 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  }

  const { data: row, error: readError } = await supabase
    .from('focus_sessions')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 })
  }
  // RLS makes another user's session invisible, so this is a 404 rather than a
  // 403 — confirming existence would itself leak something.
  if (!row) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  }

  const session = toFocusSession(row)

  if (session.status === 'COMPLETED' || session.status === 'ABANDONED') {
    return NextResponse.json(
      { error: 'That session has already ended.', session: row, serverNow: Date.now() },
      { status: 409 },
    )
  }

  // Server time. The browser never supplies the instant a transition happened.
  const now = Date.now()
  const patch = buildPatch(action, session, now)
  if (!patch) {
    return NextResponse.json(
      { error: `Cannot ${action} a session that is ${session.status.toLowerCase()}.` },
      { status: 409 },
    )
  }

  const { data: updated, error: writeError } = await supabase
    .from('focus_sessions')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()

  if (writeError) {
    return NextResponse.json({ error: writeError.message }, { status: 500 })
  }

  // Finishing the session is what completes the task — the DoD was the contract.
  if (action === 'finish' || action === 'trim') {
    await supabase
      .from('tasks')
      .update({ status: 'DONE', completed_at: new Date(now).toISOString() })
      .eq('id', session.taskId)
  }

  // Abandoning leaves the task IN_PROGRESS on purpose, so "finish what you
  // started" ranks it first the next time you open Today.

  revalidatePath('/today')
  revalidatePath('/projects')

  return NextResponse.json({ session: updated, serverNow: Date.now() })
}

function buildPatch(
  action: Action,
  session: ReturnType<typeof toFocusSession>,
  now: number,
): SessionPatch | null {
  switch (action) {
    case 'pause':
      return session.status === 'STARTED' ? planPause(session, now) : null
    case 'resume':
      return session.status === 'PAUSED' ? planResume(session, now) : null
    case 'finish':
      return planFinish(session, now)
    case 'abandon':
      return planAbandon(session, now)
    case 'trim':
      return planTrimToPlanned(session, now)
  }
}
