'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  assessRunaway,
  elapsedFocusedSeconds,
  isOvertime,
  overtimeSeconds,
  progressFraction,
  remainingSeconds,
} from '@/core/session-timer'
import type { FocusSession } from '@/core/types'
import { useServerClock } from './useServerClock'

/**
 * Drives Focus Mode.
 *
 * The important property: this hook holds no authoritative counter. The interval
 * only re-samples the clock once a second; every number shown is recomputed from
 * the session's stored timestamps. That is why a reload, a backgrounded tab, a
 * throttled iOS timer and a sleeping laptop all come back correct — none of them
 * can lose time that was never being counted in the first place.
 */

export type SessionAction = 'pause' | 'resume' | 'finish' | 'abandon' | 'trim'

interface UseFocusSessionOptions {
  initialSession: FocusSession
  initialServerNow: number
  /** Called once a session reaches a terminal state. */
  onEnded?: (session: FocusSession) => void
}

export function useFocusSession({
  initialSession,
  initialServerNow,
  onEnded,
}: UseFocusSessionOptions) {
  const [session, setSession] = useState(initialSession)
  const [error, setError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<SessionAction | null>(null)
  const { nowMs, refresh, sync } = useServerClock(initialServerNow)

  const isLive = session.status === 'STARTED' || session.status === 'PAUSED'
  const isRunning = session.status === 'STARTED'

  useEffect(() => {
    if (!isRunning) return
    const interval = window.setInterval(refresh, 1000)
    return () => window.clearInterval(interval)
  }, [isRunning, refresh])

  // Coming back from a backgrounded tab, a locked phone or a slept laptop: the
  // interval may not have fired for an hour. Recompute immediately on return.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [refresh])

  const endedRef = useRef(false)
  useEffect(() => {
    if (isLive || endedRef.current) return
    endedRef.current = true
    onEnded?.(session)
  }, [isLive, onEnded, session])

  const run = useCallback(
    async (action: SessionAction) => {
      setError(null)
      setPendingAction(action)
      try {
        const response = await fetch(`/api/sessions/${session.id}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        })
        const payload: unknown = await response.json().catch(() => null)
        const parsed = parsePayload(payload)

        if (parsed?.serverNow) sync(parsed.serverNow)

        if (!response.ok) {
          // A 409 still carries the authoritative row — adopt it rather than
          // leaving the screen showing something the server disagrees with.
          if (parsed?.session) setSession(parsed.session)
          setError(parsed?.error ?? 'That did not go through. Try again.')
          return false
        }

        if (parsed?.session) setSession(parsed.session)
        return true
      } catch {
        setError('You appear to be offline. Your focused time is safe — try again.')
        return false
      } finally {
        setPendingAction(null)
      }
    },
    [session.id, sync],
  )

  // A sampled clock, not a counter — see useServerClock.
  const currentNow = nowMs

  return {
    session,
    error,
    pendingAction,
    isLive,
    isRunning,
    elapsedSeconds: elapsedFocusedSeconds(session, currentNow),
    remainingSeconds: remainingSeconds(session, currentNow),
    overtimeSeconds: overtimeSeconds(session, currentNow),
    isOvertime: isOvertime(session, currentNow),
    progress: progressFraction(session, currentNow),
    runaway: assessRunaway(session, currentNow),
    pause: () => run('pause'),
    resume: () => run('resume'),
    finish: () => run('finish'),
    abandon: () => run('abandon'),
    trim: () => run('trim'),
    dismissError: () => setError(null),
  }
}

interface SessionResponseRow {
  id: string
  task_id: string
  planned_minutes: number
  status: FocusSession['status']
  started_at: string
  last_resumed_at: string | null
  accumulated_seconds: number
  ended_at: string | null
  dod_snapshot: string
  pause_count: number
}

/** Narrow the JSON response without trusting its shape. */
function parsePayload(
  payload: unknown,
): { session?: FocusSession; serverNow?: number; error?: string } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const record = payload as Record<string, unknown>
  const result: { session?: FocusSession; serverNow?: number; error?: string } = {}

  if (typeof record.serverNow === 'number') result.serverNow = record.serverNow
  if (typeof record.error === 'string') result.error = record.error

  const row = record.session
  if (typeof row === 'object' && row !== null) {
    const r = row as unknown as SessionResponseRow
    result.session = {
      id: r.id,
      taskId: r.task_id,
      plannedMinutes: r.planned_minutes,
      status: r.status,
      startedAt: Date.parse(r.started_at),
      lastResumedAt: r.last_resumed_at === null ? null : Date.parse(r.last_resumed_at),
      accumulatedSeconds: r.accumulated_seconds,
      endedAt: r.ended_at === null ? null : Date.parse(r.ended_at),
      dodSnapshot: r.dod_snapshot,
      pauseCount: r.pause_count,
    }
  }

  return result
}
