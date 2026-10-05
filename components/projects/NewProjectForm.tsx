'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { TextInput } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { createProject } from '@/server/actions/projects'

export function NewProjectForm() {
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
      <Button variant="secondary" size="md" onClick={() => setOpen(true)}>
        <span aria-hidden>+</span> New project
      </Button>

      <Sheet open={open} onClose={close} title="New project">
        <form
          ref={formRef}
          action={(formData) => {
            setError(null)
            startTransition(async () => {
              const result = await createProject(formData)
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
            id="project-name"
            name="name"
            label="Project name"
            required
            autoFocus
            maxLength={120}
            placeholder="FocusFlow MVP"
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
              {pending ? 'Saving…' : 'Create project'}
            </Button>
          </div>
        </form>
      </Sheet>
    </>
  )
}
