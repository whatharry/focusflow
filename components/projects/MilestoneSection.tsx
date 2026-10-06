'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { TaskRow } from '@/components/tasks/TaskRow'
import type { EditorMilestone, EditorProject } from '@/components/tasks/TaskEditor'
import { Button } from '@/components/ui/Button'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { MilestoneGroup } from '@/core/project-structure'
import type { LocalDate } from '@/core/types'
import {
  createMilestone,
  deleteMilestone,
  moveMilestone,
  renameMilestone,
} from '@/server/actions/milestones'

/**
 * One milestone heading and the tasks under it.
 *
 * Management is inline rather than behind a settings screen: rename in place,
 * nudge up or down, remove. A milestone is a heading, and headings should be
 * editable where you read them.
 */
function MilestoneHeading({
  group,
  isFirst,
  isLast,
  readOnly,
}: {
  group: MilestoneGroup
  isFirst: boolean
  isLast: boolean
  readOnly: boolean
}) {
  const router = useRouter()
  const [renaming, setRenaming] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const milestone = group.milestone

  function run(action: () => Promise<{ error?: string }>) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else {
        setRenaming(false)
        setConfirming(false)
        router.refresh()
      }
    })
  }

  if (milestone === null) {
    return (
      <h3 className="ff-label">
        {/* Only rendered when it has tasks, so it never reads as an empty bucket. */}
        Not in a milestone
      </h3>
    )
  }

  // An archived project hides its add controls, so it must hide its edit
  // controls too: a screen you cannot add to should not offer a Remove button.
  if (readOnly) {
    return <h3 className="ff-label">{milestone.title}</h3>
  }

  if (renaming) {
    return (
      <form
        action={(formData) => run(() => renameMilestone(formData))}
        className="flex flex-wrap items-center gap-2"
      >
        <input type="hidden" name="id" value={milestone.id} />
        <input
          name="title"
          defaultValue={milestone.title}
          autoFocus
          required
          maxLength={120}
          aria-label="Milestone name"
          className="min-h-[36px] min-w-0 flex-1 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-small text-ink focus:border-accent focus:outline-none"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          Save
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setRenaming(false)}>
          Cancel
        </Button>
      </form>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="ff-label">{milestone.title}</h3>

      <div className="flex items-center gap-0.5">
        {confirming ? (
          <>
            <span className="mr-1 text-micro text-muted">
              {group.tasks.length > 0 ? 'Remove heading, keep tasks?' : 'Remove?'}
            </span>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => run(() => deleteMilestone(milestone.id))}
            >
              Remove
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || isFirst}
              aria-label={`Move ${milestone.title} up`}
              onClick={() => run(() => moveMilestone(milestone.id, 'up'))}
            >
              <span aria-hidden>↑</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending || isLast}
              aria-label={`Move ${milestone.title} down`}
              onClick={() => run(() => moveMilestone(milestone.id, 'down'))}
            >
              <span aria-hidden>↓</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Remove
            </Button>
          </>
        )}
      </div>

      {error ? (
        <p role="alert" className="w-full text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function MilestoneSection({
  group,
  today,
  projects,
  milestones,
  nextTaskId,
  isFirst,
  isLast,
  readOnly = false,
}: {
  group: MilestoneGroup
  today: LocalDate
  projects: EditorProject[]
  milestones: EditorMilestone[]
  nextTaskId: string | null
  isFirst: boolean
  isLast: boolean
  /** Archived projects show their structure without offering to change it. */
  readOnly?: boolean
}) {
  return (
    <section className="flex flex-col gap-3">
      <MilestoneHeading group={group} isFirst={isFirst} isLast={isLast} readOnly={readOnly} />

      {group.milestone !== null && group.progress.total > 0 ? (
        <ProgressBar progress={group.progress} label={false} />
      ) : null}

      {group.tasks.length === 0 ? (
        <p className="px-2 text-small text-faint">Nothing here yet.</p>
      ) : (
        <ul className="-mx-2">
          {group.tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              today={today}
              projects={projects}
              milestones={milestones}
              isNext={task.id === nextTaskId}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

/** Inline "add a milestone" control, at the foot of the milestone list. */
export function NewMilestoneForm({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-[44px] w-full rounded-md border border-dashed border-line px-4 py-3 text-left text-small text-muted transition-colors duration-[120ms] hover:border-line-strong hover:text-ink"
      >
        + Add a milestone
      </button>
    )
  }

  return (
    <form
      action={(formData) => {
        setError(null)
        startTransition(async () => {
          const result = await createMilestone(formData)
          if (result.error) setError(result.error)
          else {
            setOpen(false)
            router.refresh()
          }
        })
      }}
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <div className="flex flex-wrap items-center gap-2">
        <input
          name="title"
          autoFocus
          required
          maxLength={120}
          placeholder="Authentication"
          aria-label="Milestone name"
          className="min-h-[44px] min-w-0 flex-1 rounded-sm border border-line bg-surface px-3 py-2.5 text-small text-ink focus:border-accent focus:outline-none"
        />
        <Button type="submit" variant="secondary" size="md" disabled={pending}>
          {pending ? 'Adding…' : 'Add'}
        </Button>
        <Button type="button" variant="ghost" size="md" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </form>
  )
}
