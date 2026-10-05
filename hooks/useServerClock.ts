'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A clock that reports *server* time, sampled into state rather than read during
 * render.
 *
 * Two problems are being solved at once:
 *
 * 1. The browser's clock may be minutes or hours off. Every persisted timestamp
 *    comes from the server, so rendering against raw `Date.now()` would show a
 *    timer that disagrees with the record. We keep the offset observed from server
 *    responses and add it to local time — local time provides the smooth tick, the
 *    server still defines the truth.
 * 2. Reading the clock while rendering is impure, and it makes the server-rendered
 *    HTML disagree with the first client paint. So `nowMs` starts at the server's
 *    own value and is only ever *replaced* by a fresh sample.
 *
 * `nowMs` is a sample, never an accumulator: each update overwrites it outright, so
 * missed or throttled ticks cannot drift. The authoritative elapsed time is still
 * derived from the session's stored timestamps, never from this.
 */
export function useServerClock(initialServerNow: number) {
  const offsetRef = useRef(0)
  const [nowMs, setNowMs] = useState(initialServerNow)

  /** Take a new sample. Safe to call as often as you like. */
  const refresh = useCallback(() => {
    setNowMs(Date.now() + offsetRef.current)
  }, [])

  /** Re-measure the offset from a server-supplied timestamp. */
  const sync = useCallback((serverNow: number) => {
    offsetRef.current = serverNow - Date.now()
    setNowMs(serverNow)
  }, [])

  // First measurement happens after mount: there is no browser clock to compare
  // against during a server render, and the comparison is impure anyway. No state
  // is set here — `nowMs` already *is* the server's value on the first paint, and
  // the next sample will pick the offset up.
  //
  // The measurement absorbs however long the response took to arrive, so the offset
  // is pessimistic by roughly one network hop. That is well under the one-second
  // resolution anything on screen is displayed at.
  useEffect(() => {
    offsetRef.current = initialServerNow - Date.now()
  }, [initialServerNow])

  return { nowMs, refresh, sync }
}
