'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Select, TextInput } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { quickAddTask } from '@/server/actions/tasks'
import { SESSION_DURATION_OPTIONS } from '@/core/types'

export interface QuickAddProject {
  id: string
  name: string
}

/**
 * Capture in under five seconds. A title is enough; estimate and project are
 * optional, and nothing here blocks saving. If capture costs more than a moment
 * you stop capturing and start holding things in your head instead.
 */
export function QuickAdd({
  projects,
  defaultProjectId,
  trigger = 'button',
}: {
  projects: QuickAddProject[]
  defaultProjectId?: string | undefined
  trigger?: 'button' | 'inline'
}) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  function close() {
    setOpen(false)
    setError(null)
  }

  return (
    <>
      {trigger === 'button' ? (
        <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
          <span aria-hidden>+</span> Add task
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-md border border-dashed border-line px-4 py-3 text-left text-small text-muted transition-colors duration-[120ms] hover:border-line-strong hover:text-ink"
        >
          + Add a task
        </button>
      )}

      <Sheet open={open} onClose={close} title="Add a task">
        <form
          ref={formRef}
          action={(formData) => {
            setError(null)
            startTransition(async () => {
              const result = await quickAddTask(formData)
              if (result.error) setError(result.error)
              else {
                formRef.current?.reset()
                close()
              }
            })
          }}
          className="mt-5 flex flex-col gap-5"
        >
          <TextInput
            id="quick-add-title"
            name="title"
            label="What needs doing?"
            required
            autoFocus
            maxLength={200}
            placeholder="Create signup API"
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              id="quick-add-estimate"
              name="estimate_minutes"
              label="Estimate"
              defaultValue=""
              hint="Optional."
            >
              <option value="">Not sure yet</option>
              {SESSION_DURATION_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </Select>

            <Select
              id="quick-add-project"
              name="project_id"
              label="Project"
              defaultValue={defaultProjectId ?? ''}
              hint="Optional."
            >
              <option value="">No project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </div>

          {error ? (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" size="md" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" disabled={pending}>
              {pending ? 'Saving…' : 'Add task'}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  )
}
