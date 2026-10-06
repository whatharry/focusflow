'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { TextArea, TextInput } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { createProject, updateProject } from '@/server/actions/projects'

export interface EditableProject {
  id: string
  name: string
  description: string | null
}

/**
 * Create and edit share one form, because they are the same two fields. A
 * separate "edit project" screen would be a second place for the validation
 * rules to disagree with themselves.
 */
export function ProjectForm({
  project,
  open,
  onClose,
}: {
  /** Omitted when creating. */
  project?: EditableProject
  open: boolean
  onClose: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const editing = project !== undefined

  function close() {
    setError(null)
    onClose()
  }

  return (
    <Sheet open={open} onClose={close} title={editing ? 'Edit project' : 'New project'}>
      <form
        ref={formRef}
        action={(formData) => {
          setError(null)
          startTransition(async () => {
            const result = editing ? await updateProject(formData) : await createProject(formData)
            if (result.error) setError(result.error)
            else {
              if (!editing) formRef.current?.reset()
              close()
            }
          })
        }}
        className="mt-5 flex flex-col gap-5"
      >
        {editing ? <input type="hidden" name="id" value={project.id} /> : null}

        <TextInput
          id="project-name"
          name="name"
          label="Project name"
          required
          autoFocus
          maxLength={120}
          placeholder="Website redesign"
          defaultValue={project?.name ?? ''}
        />

        <TextArea
          id="project-description"
          name="description"
          label="What is this for?"
          rows={2}
          maxLength={500}
          defaultValue={project?.description ?? ''}
          hint="Optional. One line to remind you why this exists."
        />

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
            {pending ? 'Saving…' : editing ? 'Save' : 'Create project'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

/** The button + sheet pair used by the projects list header. */
export function NewProjectButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        <span aria-hidden>+</span> New project
      </Button>
      <ProjectForm open={open} onClose={() => setOpen(false)} />
    </>
  )
}
