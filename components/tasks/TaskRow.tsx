'use client'

import { useState } from 'react'
import { TaskEditor, type EditorMilestone, type EditorProject } from '@/components/tasks/TaskEditor'
import { formatDueDate } from '@/core/date'
import type { LocalDate, Task, TaskStatus } from '@/core/types'
import { cn } from '@/lib/cn'

/**
 * One task in a list, and the way into the editor.
 *
 * The glyph carries the status so the row needs no badge: a tick for done, an
 * arrow for the thing you are on, a ring for everything waiting. Three symbols
 * is as much vocabulary as a list like this can carry before it needs a legend.
 */
const GLYPHS: Record<TaskStatus, { symbol: string; className: string; label: string }> = {
  DONE: { symbol: '✓', className: 'text-accent', label: 'Done' },
  IN_PROGRESS: { symbol: '→', className: 'text-accent', label: 'In progress' },
  BLOCKED: { symbol: '⊘', className: 'text-faint', label: 'Blocked' },
  BACKLOG: { symbol: '·', className: 'text-faint', label: 'Backlog' },
  TODO: { symbol: '○', className: 'text-faint', label: 'To do' },
  ARCHIVED: { symbol: '·', className: 'text-faint', label: 'Archived' },
}

export function TaskRow({
  task,
  today,
  projects,
  milestones,
  isNext = false,
}: {
  task: Task
  today: LocalDate
  projects: EditorProject[]
  milestones: EditorMilestone[]
  /** The one task the project is proposing. Marked, never re-ordered. */
  isNext?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const glyph = GLYPHS[task.status]
  const done = task.status === 'DONE'
  const due = task.dueDate === null ? null : formatDueDate(task.dueDate, today)

  return (
    <>
      <li>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={cn(
            'flex w-full items-baseline gap-3 rounded-md px-2 py-2.5 text-left',
            'min-h-[44px] transition-colors duration-[120ms] hover:bg-raised',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
          )}
        >
          <span aria-hidden className={cn('w-3 shrink-0 text-center', glyph.className)}>
            {glyph.symbol}
          </span>
          <span className="sr-only">{glyph.label}: </span>

          <span className="min-w-0 flex-1">
            <span
              className={cn(
                'text-small',
                done ? 'text-faint line-through decoration-line' : 'text-ink',
                isNext && !done && 'font-medium',
              )}
            >
              {task.title}
            </span>

            {task.estimateMinutes !== null || due || task.priority === 'HIGH' ? (
              <span className="mt-0.5 block text-micro text-faint">
                {[
                  task.priority === 'HIGH' && !done ? 'High' : null,
                  task.estimateMinutes !== null ? `~${task.estimateMinutes} min` : null,
                  done ? null : due,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
          </span>

          {isNext && !done ? <span className="ff-label shrink-0 text-accent">Next</span> : null}
        </button>
      </li>

      {editing ? (
        <TaskEditor
          task={task}
          projects={projects}
          milestones={milestones}
          open={editing}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </>
  )
}
