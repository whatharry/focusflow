'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ProjectForm, type EditableProject } from '@/components/projects/ProjectForm'
import { Button } from '@/components/ui/Button'
import { archiveProject, restoreProject } from '@/server/actions/projects'
import type { ProjectStatus } from '@/core/types'

/**
 * Edit, archive and restore, on the project detail screen.
 *
 * Archiving asks once. It is reversible and destroys nothing, so a modal would
 * be theatre — but it does move a project out of sight, which is enough of a
 * surprise to be worth a confirm step.
 */
export function ProjectSettings({
  project,
  status,
  openTasks,
}: {
  project: EditableProject
  status: ProjectStatus
  openTasks: number
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ error?: string }>, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (result.error) setError(result.error)
      else {
        setConfirming(false)
        after?.()
        router.refresh()
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Edit project
        </Button>

        {status === 'ACTIVE' ? (
          confirming ? (
            <span className="flex items-center gap-2">
              <span className="text-small text-muted">
                {openTasks > 0
                  ? `Archive, and stop suggesting its ${openTasks === 1 ? 'task' : `${openTasks} tasks`}?`
                  : 'Archive this project?'}
              </span>
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() => run(() => archiveProject(project.id))}
              >
                Archive
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
              Archive project
            </Button>
          )
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => run(() => restoreProject(project.id))}
          >
            Restore project
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      ) : null}

      <ProjectForm project={project} open={editing} onClose={() => setEditing(false)} />
    </div>
  )
}
