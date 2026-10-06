import type { ProjectProgress } from '@/core/project-structure'
import { pluralise } from '@/core/progress'

/**
 * A single hairline, not a chart.
 *
 * The number carries the meaning and the bar is there to be read at a glance
 * while scrolling. Anything more — segments, colours by state, a donut — would
 * turn a project list into a dashboard, which is the thing this product is
 * deliberately not.
 */
export function ProgressBar({
  progress,
  label = true,
}: {
  progress: ProjectProgress
  label?: boolean
}) {
  if (progress.total === 0) {
    return label ? <p className="text-small text-faint">No tasks yet</p> : null
  }

  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <p className="text-small text-muted">
          <span className="text-ink">{progress.percent}% complete</span>
          {progress.remaining > 0 ? ` · ${pluralise(progress.remaining, 'task')} remaining` : null}
        </p>
      ) : null}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={`${progress.completed} of ${progress.total} tasks complete`}
        className="h-1 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-[var(--ease-calm)]"
          style={{ width: `${progress.percent}%` }}
        />
      </div>
    </div>
  )
}
