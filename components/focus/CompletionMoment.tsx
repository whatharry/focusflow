'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { PreflightSheet } from '@/components/focus/PreflightSheet'
import { formatFocusedDuration, pluralise } from '@/core/progress'

/**
 * The completion moment.
 *
 * Deliberately not a dump back into the backlog. Three facts, then two honest
 * choices — and "I'm done for today" is as legitimate an answer as "continue".
 * Permission to stop is what makes showing up tomorrow cheap.
 *
 * No confetti, no XP, no streak. The restraint is the point: the reward on offer
 * is the sentence "I am someone who shows up and finishes things", and anything
 * childish next to it would undercut it.
 */
export function CompletionMoment({
  focusedSeconds,
  tasksCompletedToday,
  taskTitle,
  nextTask,
}: {
  focusedSeconds: number
  tasksCompletedToday: number
  taskTitle: string
  nextTask: { id: string; title: string } | null
}) {
  const router = useRouter()
  const [preflightOpen, setPreflightOpen] = useState(false)

  return (
    <main className="ff-safe-top ff-safe-bottom flex min-h-dvh flex-col justify-center px-5 py-10">
      <div className="ff-reveal mx-auto w-full max-w-md">
        <p aria-hidden className="text-h1 text-success">
          ✓
        </p>
        <h1 className="mt-3 text-h1 font-semibold">You made progress.</h1>
        <p className="mt-2 text-body text-muted text-balance">{taskTitle}</p>

        <dl className="mt-8 flex flex-col divide-y divide-line border-y border-line">
          <div className="flex items-baseline justify-between py-3">
            <dt className="text-small text-muted">This session</dt>
            <dd className="ff-tabular text-body font-medium">
              {formatFocusedDuration(focusedSeconds)} focused
            </dd>
          </div>
          <div className="flex items-baseline justify-between py-3">
            <dt className="text-small text-muted">Finished today</dt>
            <dd className="ff-tabular text-body font-medium">
              {pluralise(tasksCompletedToday, 'task')}
            </dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-col gap-3">
          {nextTask ? (
            <>
              <Button
                variant="primary"
                size="lg"
                fullWidth
                onClick={() => setPreflightOpen(true)}
              >
                Continue
              </Button>
              <p className="text-center text-small text-faint text-balance">
                Next: {nextTask.title}
              </p>
            </>
          ) : (
            <Button variant="primary" size="lg" fullWidth onClick={() => router.push('/today')}>
              Back to Today
            </Button>
          )}

          <Button variant="ghost" size="lg" fullWidth onClick={() => router.push('/today')}>
            I&apos;m done for today
          </Button>
        </div>
      </div>

      {nextTask ? (
        <PreflightSheet
          open={preflightOpen}
          onClose={() => setPreflightOpen(false)}
          taskId={nextTask.id}
          taskTitle={nextTask.title}
          initialDefinitionOfDone={null}
          estimateMinutes={null}
        />
      ) : null}
    </main>
  )
}
