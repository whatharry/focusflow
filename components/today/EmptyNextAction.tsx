import { Card } from '@/components/ui/Card'
import { QuickAdd, type QuickAddProject } from '@/components/tasks/QuickAdd'
import type { NoneReason } from '@/core/next-action'

/**
 * Every "nothing to do" state names a specific reason and offers a specific way
 * out. A blank screen with no exit is the one thing Today must never be.
 */
const COPY: Record<NoneReason, { title: string; body: string }> = {
  NO_TASKS: {
    title: 'Nothing captured yet.',
    body: 'Add the first thing you want to move forward. A title is enough.',
  },
  ALL_BLOCKED: {
    title: 'Everything is parked.',
    body: 'Each remaining task is waiting on something. Unblock one, or add a new action you can start now.',
  },
  ALL_DONE: {
    title: 'Everything is done.',
    body: 'Genuinely nothing left. Add what comes next whenever you are ready.',
  },
  PLAN_COMPLETE: {
    title: "You finished today's three.",
    body: 'Other work remains if you want it, but stopping here is a complete day.',
  },
  DAY_CLOSED: {
    title: 'You called it a day.',
    body: 'Today is closed. Everything will be waiting tomorrow.',
  },
  ALL_OVERSIZED: {
    title: 'Nothing here is startable yet.',
    body: 'What is left looks bigger than a single session. Break one down into a concrete first action.',
  },
}

export function EmptyNextAction({
  reason,
  projects,
}: {
  reason: NoneReason
  projects: QuickAddProject[]
}) {
  const copy = COPY[reason]

  return (
    <Card>
      <p className="ff-label">Next</p>
      <h2 className="mt-2 text-h2 font-semibold">{copy.title}</h2>
      <p className="mt-2 text-body text-muted">{copy.body}</p>
      <div className="mt-6">
        <QuickAdd projects={projects} trigger="inline" />
      </div>
    </Card>
  )
}
