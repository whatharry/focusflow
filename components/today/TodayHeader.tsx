import { formatFocusedDuration, pluralise, type DailyProgress } from '@/core/progress'

/**
 * Greeting and the day's two honest numbers. No streak, no target, no percentage
 * of a quota the user never agreed to — just what actually happened today.
 */
export function TodayHeader({
  greeting,
  displayName,
  progress,
}: {
  greeting: string
  displayName: string | null
  progress: DailyProgress
}) {
  const { focusedSeconds, tasksCompleted } = progress
  const nothingYet = focusedSeconds === 0 && tasksCompleted === 0

  return (
    <header className="pt-8 pb-6 sm:pt-10">
      <h1 className="text-h2 font-semibold tracking-tight">
        {greeting}
        {displayName ? `, ${displayName}` : ''}
      </h1>

      <p className="mt-1 text-small text-muted">
        {nothingYet ? (
          'Nothing logged yet today.'
        ) : (
          <>
            {formatFocusedDuration(focusedSeconds)} focused
            {tasksCompleted > 0
              ? ` · ${pluralise(tasksCompleted, 'task')} done`
              : ''}
          </>
        )}
      </p>
    </header>
  )
}
