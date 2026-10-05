'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { TextArea } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { cn } from '@/lib/cn'
import {
  clampToLadder,
  DEFAULT_SESSION_MINUTES,
  SESSION_DURATION_OPTIONS,
  type SessionDurationOption,
} from '@/core/types'
import { startSession } from '@/server/actions/sessions'

/**
 * The two questions asked before every session.
 *
 * "What does DONE look like?" is required. The field is pre-filled from the task's
 * saved Definition of Done whenever there is one, so the requirement costs a
 * confirmation rather than a retype — which matters because three flows re-enter
 * this sheet (continuing after a win, resuming tomorrow, restarting after a break).
 */
export function PreflightSheet({
  open,
  onClose,
  taskId,
  taskTitle,
  initialDefinitionOfDone,
  estimateMinutes,
}: {
  open: boolean
  onClose: () => void
  taskId: string
  taskTitle: string
  initialDefinitionOfDone: string | null
  estimateMinutes: number | null
}) {
  const router = useRouter()
  const [minutes, setMinutes] = useState<SessionDurationOption>(
    estimateMinutes === null ? DEFAULT_SESSION_MINUTES : clampToLadder(estimateMinutes),
  )
  const [dod, setDod] = useState(initialDefinitionOfDone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const trimmed = dod.trim()
  const canStart = trimmed.length >= 10

  return (
    <Sheet open={open} onClose={onClose} title="Before you start" showTitle={false}>
      <form
        action={(formData) => {
          setError(null)
          startTransition(async () => {
            const result = await startSession(formData)
            if (result?.liveSessionId) {
              // Something is already running. Resuming beats starting.
              router.push(`/focus/${result.liveSessionId}`)
              return
            }
            if (result?.error) setError(result.error)
          })
        }}
        className="flex flex-col gap-6"
      >
        <input type="hidden" name="task_id" value={taskId} />
        <input type="hidden" name="planned_minutes" value={minutes} />

        <div>
          <p className="ff-label">Starting</p>
          <h2 className="mt-1 text-h2 font-semibold">{taskTitle}</h2>
        </div>

        <div>
          <TextArea
            id="definition_of_done"
            name="definition_of_done"
            label="What does DONE look like?"
            rows={3}
            required
            maxLength={500}
            value={dod}
            onChange={(event) => setDod(event.target.value)}
            placeholder="POST /auth/signup returns 201 and a session"
            hint={
              trimmed.length === 0
                ? 'One concrete sentence. Not "work on backend" — something you can check.'
                : canStart
                  ? undefined
                  : 'A little more concrete: what will be true when this is finished?'
            }
          />
        </div>

        <fieldset>
          <legend className="ff-label mb-2">How long do you want to work?</legend>
          <div className="grid grid-cols-5 gap-2">
            {SESSION_DURATION_OPTIONS.map((option) => {
              const selected = option === minutes
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setMinutes(option)}
                  className={cn(
                    'min-h-[44px] rounded-full border text-small font-medium transition-colors duration-[120ms]',
                    selected
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
                  )}
                >
                  {option}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-small text-faint">Minutes.</p>
        </fieldset>

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Not now
          </Button>
          <Button type="submit" variant="primary" size="lg" disabled={pending || !canStart}>
            {pending ? 'Starting…' : `Start ${minutes} minutes`}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
