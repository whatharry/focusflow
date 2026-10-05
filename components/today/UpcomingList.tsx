import type { TaskCandidate } from '@/core/next-action'

/**
 * A deliberately short peek at what follows, in the same order pickNextAction
 * would choose. Capped, because a full list would turn Today back into a task
 * manager and reintroduce exactly the choosing the product exists to remove.
 */
export function UpcomingList({
  tasks,
  total,
  projectNames,
}: {
  tasks: readonly TaskCandidate[]
  total: number
  projectNames: ReadonlyMap<string, string>
}) {
  if (tasks.length === 0) return null
  const hidden = total - tasks.length

  return (
    <section aria-labelledby="upcoming-heading">
      <h2 id="upcoming-heading" className="ff-label">
        After that
      </h2>
      <ul className="mt-3 space-y-2.5">
        {tasks.map((task) => {
          const projectName = task.projectId === null ? null : projectNames.get(task.projectId)
          return (
            <li key={task.id} className="text-small">
              <span className="text-ink">{task.title}</span>
              {projectName ? <span className="text-faint"> · {projectName}</span> : null}
            </li>
          )
        })}
      </ul>
      {hidden > 0 ? (
        <p className="mt-3 text-small text-faint">
          {hidden} more waiting. You only need the first one.
        </p>
      ) : null}
    </section>
  )
}
