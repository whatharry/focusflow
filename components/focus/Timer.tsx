import { formatTimer } from '@/core/session-timer'
import { cn } from '@/lib/cn'

/**
 * The timer. Counts down to the commitment, then counts up past it.
 *
 * The ring is a hairline, not a progress bar — at this size a heavy indicator
 * would compete with the digits, and the digits are the point.
 */
export function Timer({
  remainingSeconds,
  overtimeSeconds,
  isOvertime,
  progress,
  isRunning,
}: {
  remainingSeconds: number
  overtimeSeconds: number
  isOvertime: boolean
  progress: number
  isRunning: boolean
}) {
  const display = isOvertime ? formatTimer(overtimeSeconds) : formatTimer(remainingSeconds)
  const degrees = Math.round(progress * 360)

  return (
    <div className="relative flex items-center justify-center">
      <div
        aria-hidden
        className="absolute aspect-square w-[min(78vw,22rem)] rounded-full"
        style={{
          // One element, no SVG: a conic sweep masked to a 2px ring.
          background: `conic-gradient(var(--ff-accent) ${degrees}deg, var(--ff-line) 0deg)`,
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
          WebkitMask:
            'radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px))',
          opacity: isRunning ? 1 : 0.45,
          transition: 'opacity 200ms var(--ease-calm)',
        }}
      />
      <div className="relative flex flex-col items-center px-8 py-16">
        <p
          role="timer"
          aria-live="off"
          className={cn('ff-timer', isOvertime ? 'text-muted' : 'text-ink')}
        >
          {isOvertime ? `+${display}` : display}
        </p>
        <p className="ff-label mt-3">
          {isOvertime ? 'Over your plan' : isRunning ? 'Remaining' : 'Paused'}
        </p>
      </div>
    </div>
  )
}
