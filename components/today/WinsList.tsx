import type { Task } from '@/core/types'

/**
 * Today's wins. Shown only when there is something to show — an empty "wins"
 * heading reads as an accusation.
 */
export function WinsList({ wins }: { wins: readonly Task[] }) {
  if (wins.length === 0) return null

  return (
    <section aria-labelledby="wins-heading">
      <h2 id="wins-heading" className="ff-label">
        Today&rsquo;s wins
      </h2>
      <ul className="mt-3 space-y-2">
        {wins.map((task) => (
          <li key={task.id} className="flex gap-2.5 text-small text-muted">
            <span aria-hidden className="text-accent">
              ✓
            </span>
            <span className="min-w-0 line-through decoration-line">{task.title}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
