'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { PreflightSheet } from '@/components/focus/PreflightSheet'
import type { TaskCandidate } from '@/core/next-action'

/**
 * The one card that matters, carrying the only primary button on the screen.
 *
 * When a session is already live this becomes "Resume" and goes straight back to
 * it — no pre-flight, because the commitment was already made.
 */
export function NextActionCard({
  task,
  projectName,
  intent,
  liveSessionId,
}: {
  task: TaskCandidate
  projectName: string | null
  intent: 'START' | 'RESUME'
  liveSessionId: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const resuming = intent === 'RESUME' && liveSessionId !== null

  return (
    <>
      <Card emphasis>
        <p className="ff-label">{resuming ? 'In progress' : 'Next'}</p>
        <h2 className="mt-2 text-h1 font-semibold text-balance">{task.title}</h2>

        <p className="mt-2 text-small text-muted">
          {projectName ?? 'No project'}
          {task.estimateMinutes !== null ? ` · ~${task.estimateMinutes} min` : ''}
        </p>

        {task.definitionOfDone ? (
          <div className="mt-4 border-l-2 border-line pl-3">
            <p className="ff-label">Definition of done</p>
            <p className="mt-1 text-small text-muted">{task.definitionOfDone}</p>
          </div>
        ) : null}

        <div className="mt-6">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            className="sm:w-auto sm:px-8"
            onClick={() => {
              if (resuming) router.push(`/focus/${liveSessionId}`)
              else setOpen(true)
            }}
          >
            {resuming ? 'Resume focus' : 'Start focus'}
          </Button>
        </div>
      </Card>

      {resuming ? null : (
        <PreflightSheet
          open={open}
          onClose={() => setOpen(false)}
          taskId={task.id}
          taskTitle={task.title}
          initialDefinitionOfDone={task.definitionOfDone}
          estimateMinutes={task.estimateMinutes}
        />
      )}
    </>
  )
}
