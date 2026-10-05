'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Timer } from '@/components/focus/Timer'
import { useFocusSession } from '@/hooks/useFocusSession'
import { formatFocusedDuration } from '@/core/progress'
import type { FocusSession } from '@/core/types'
import { CompletionMoment } from '@/components/focus/CompletionMoment'

/**
 * Focus Mode.
 *
 * Nothing on this screen links anywhere except out of the session: no navigation,
 * no project list, no backlog, no counts. The entire purpose is to let you forget
 * that the rest of the application exists.
 */
export function FocusScreen({
  initialSession,
  initialServerNow,
  taskTitle,
  projectName,
  nextTask,
  tasksCompletedToday,
}: {
  initialSession: FocusSession
  initialServerNow: number
  taskTitle: string
  projectName: string | null
  nextTask: { id: string; title: string } | null
  tasksCompletedToday: number
}) {
  const router = useRouter()
  const [finished, setFinished] = useState(false)
  const [leaving, setLeaving] = useState(false)

  const onEnded = useCallback(() => {
    // Nothing: the screen's own buttons decide where the user goes next, so an
    // already-terminal session simply renders its completion state.
  }, [])

  const timer = useFocusSession({ initialSession, initialServerNow, onEnded })
  const { session } = timer

  if (finished || session.status === 'COMPLETED') {
    return (
      <CompletionMoment
        focusedSeconds={session.accumulatedSeconds}
        tasksCompletedToday={
          // The rollup was computed before this task completed, so add it here
          // rather than refetching the whole screen for one number.
          session.status === 'COMPLETED' ? tasksCompletedToday + 1 : tasksCompletedToday
        }
        taskTitle={taskTitle}
        nextTask={nextTask}
      />
    )
  }

  const runaway = timer.runaway

  return (
    <main className="ff-safe-top ff-safe-bottom flex min-h-dvh flex-col overscroll-none px-5 py-6">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col">
        <header className="shrink-0">
          {projectName ? <p className="ff-label">{projectName}</p> : null}
          <h1 className="mt-1 text-h1 font-semibold text-balance">{taskTitle}</h1>
          <div className="mt-4 border-l-2 border-line pl-3">
            <p className="ff-label">Definition of done</p>
            <p className="mt-1 text-small text-muted">{session.dodSnapshot}</p>
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center py-6">
          <Timer
            remainingSeconds={timer.remainingSeconds}
            overtimeSeconds={timer.overtimeSeconds}
            isOvertime={timer.isOvertime}
            progress={timer.progress}
            isRunning={timer.isRunning}
          />
        </div>

        <footer className="shrink-0">
          {runaway.isRunaway ? (
            <div className="mb-4 rounded-md border border-line bg-raised p-4">
              <p className="text-small text-ink">
                This has been running for {formatFocusedDuration(runaway.elapsedSeconds)}. If you
                stepped away, trim it to the {formatFocusedDuration(runaway.trimmedSeconds)} you
                planned so your totals stay honest.
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={timer.pendingAction !== null}
                  onClick={async () => {
                    const ok = await timer.trim()
                    if (ok) setFinished(true)
                  }}
                >
                  Trim to {session.plannedMinutes}m
                </Button>
                <Button size="sm" variant="ghost" onClick={() => timer.dismissError()}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : null}

          {timer.error ? (
            <p role="alert" className="mb-4 text-small text-danger">
              {timer.error}
            </p>
          ) : null}

          <p className="mb-4 text-center text-small text-faint">
            Planned {session.plannedMinutes} minutes · {formatFocusedDuration(timer.elapsedSeconds)}{' '}
            focused so far
          </p>

          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              disabled={timer.pendingAction !== null}
              onClick={async () => {
                const ok = await timer.finish()
                if (ok) setFinished(true)
              }}
            >
              {timer.pendingAction === 'finish' ? 'Finishing…' : 'Finish task'}
            </Button>

            <div className="flex gap-3">
              {timer.isRunning ? (
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={timer.pendingAction !== null}
                  onClick={() => timer.pause()}
                >
                  {timer.pendingAction === 'pause' ? 'Pausing…' : 'Pause'}
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="lg"
                  fullWidth
                  disabled={timer.pendingAction !== null}
                  onClick={() => timer.resume()}
                >
                  {timer.pendingAction === 'resume' ? 'Resuming…' : 'Resume'}
                </Button>
              )}
            </div>

            {leaving ? (
              <div className="rounded-md border border-line bg-raised p-4">
                <p className="text-small text-ink">
                  Leave this session? Your {formatFocusedDuration(timer.elapsedSeconds)} of focused
                  time is kept either way.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={timer.pendingAction !== null}
                    onClick={async () => {
                      const ok = await timer.abandon()
                      if (ok) router.push('/today')
                    }}
                  >
                    Leave session
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLeaving(false)}>
                    Stay
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLeaving(true)}
                className="mx-auto min-h-[44px] px-3 text-small text-faint underline-offset-4 hover:text-muted hover:underline"
              >
                Leave session
              </button>
            )}
          </div>
        </footer>
      </div>
    </main>
  )
}
