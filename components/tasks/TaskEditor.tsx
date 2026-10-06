'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Select, TextArea, TextInput } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { SESSION_DURATION_OPTIONS, TASK_PRIORITIES, type TaskPriority } from '@/core/types'
import type { Task } from '@/core/types'
import { archiveTask, updateTask } from '@/server/actions/tasks'

export interface EditorProject {
  id: string
  name: string
}

export interface EditorMilestone {
  id: string
  title: string
  projectId: string
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
}

/**
 * Editable statuses. ARCHIVED is missing on purpose: it has its own button,
 * because it is the one choice here you would not want to make by mistake while
 * reaching for the status dropdown.
 */
const STATUS_OPTIONS = [
  { value: 'TODO', label: 'To do' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'BLOCKED', label: 'Blocked' },
  { value: 'BACKLOG', label: 'Backlog — stop suggesting this' },
  { value: 'DONE', label: 'Done' },
] as const

/**
 * The task editor.
 *
 * Ordered by what the product actually cares about: what the task is, what DONE
 * looks like, how long it will take. Everything below that line is filing, and
 * filing is never required.
 *
 * The project and milestone selects are coupled — picking a project narrows the
 * milestones to that project's, and choosing "No project" empties them — because
 * the database rejects any other combination and meeting a foreign key error
 * would be a terrible way to learn that.
 */
export function TaskEditor({
  task,
  projects,
  milestones,
  open,
  onClose,
}: {
  task: Task
  projects: EditorProject[]
  milestones: EditorMilestone[]
  open: boolean
  onClose: () => void
}) {
  const [projectId, setProjectId] = useState(task.projectId ?? '')
  const [milestoneId, setMilestoneId] = useState(task.milestoneId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirmingArchive, setConfirmingArchive] = useState(false)

  const available = useMemo(
    () => milestones.filter((milestone) => milestone.projectId === projectId),
    [milestones, projectId],
  )

  function close() {
    setError(null)
    setConfirmingArchive(false)
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title="Edit task" showTitle={false}>
      <form
        action={(formData) => {
          setError(null)
          startTransition(async () => {
            const result = await updateTask(formData)
            if (result.error) setError(result.error)
            else close()
          })
        }}
        className="flex flex-col gap-5"
      >
        <input type="hidden" name="id" value={task.id} />

        <TextInput
          id={`task-title-${task.id}`}
          name="title"
          label="What needs doing?"
          required
          maxLength={200}
          defaultValue={task.title}
        />

        <TextArea
          id={`task-dod-${task.id}`}
          name="definition_of_done"
          label="What does done look like?"
          rows={2}
          maxLength={500}
          defaultValue={task.definitionOfDone ?? ''}
          hint="Asked again before every session. Filling it in now saves typing later."
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            id={`task-estimate-${task.id}`}
            name="estimate_minutes"
            label="Estimate"
            defaultValue={task.estimateMinutes === null ? '' : String(task.estimateMinutes)}
          >
            <option value="">Not sure yet</option>
            {SESSION_DURATION_OPTIONS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
            {task.estimateMinutes !== null &&
            !SESSION_DURATION_OPTIONS.includes(
              task.estimateMinutes as (typeof SESSION_DURATION_OPTIONS)[number],
            ) ? (
              // An estimate set before the ladder existed, or by a future phase.
              // Showing it keeps the select honest rather than silently rounding.
              <option value={task.estimateMinutes}>{task.estimateMinutes} min</option>
            ) : null}
          </Select>

          <Select
            id={`task-status-${task.id}`}
            name="status"
            label="Status"
            defaultValue={task.status === 'ARCHIVED' ? 'TODO' : task.status}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>

          <Select
            id={`task-priority-${task.id}`}
            name="priority"
            label="Priority"
            defaultValue={task.priority}
          >
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {PRIORITY_LABELS[priority]}
              </option>
            ))}
          </Select>

          <TextInput
            id={`task-due-${task.id}`}
            name="due_date"
            type="date"
            label="Due date"
            defaultValue={task.dueDate ?? ''}
            hint="Optional."
          />

          <Select
            id={`task-project-${task.id}`}
            name="project_id"
            label="Project"
            value={projectId}
            onChange={(event) => {
              setProjectId(event.target.value)
              // The old milestone belongs to the old project. Carrying it across
              // is exactly what the database refuses.
              setMilestoneId('')
            }}
          >
            <option value="">No project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>

          <Select
            id={`task-milestone-${task.id}`}
            name="milestone_id"
            label="Milestone"
            value={milestoneId}
            disabled={projectId === ''}
            onChange={(event) => setMilestoneId(event.target.value)}
            hint={projectId === '' ? 'Pick a project first.' : undefined}
          >
            <option value="">No milestone</option>
            {available.map((milestone) => (
              <option key={milestone.id} value={milestone.id}>
                {milestone.title}
              </option>
            ))}
          </Select>
        </div>

        <TextArea
          id={`task-description-${task.id}`}
          name="description"
          label="Notes"
          rows={3}
          maxLength={2000}
          defaultValue={task.description ?? ''}
          hint="Optional. Context you would otherwise have to remember."
        />

        {error ? (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
          {confirmingArchive ? (
            <div className="flex items-center gap-3">
              <p className="text-small text-muted">Archive this task?</p>
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await archiveTask(task.id)
                    if (result.error) setError(result.error)
                    else close()
                  })
                }}
              >
                Archive
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingArchive(false)}
              >
                Keep
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingArchive(true)}
            >
              Archive task
            </Button>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" size="md" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </Sheet>
  )
}
