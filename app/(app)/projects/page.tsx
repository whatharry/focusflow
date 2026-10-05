import { redirect } from 'next/navigation'
import { NewProjectForm } from '@/components/projects/NewProjectForm'
import { QuickAdd } from '@/components/tasks/QuickAdd'
import { Card } from '@/components/ui/Card'
import { isStartableStatus } from '@/core/next-action'
import { pluralise } from '@/core/progress'
import type { Task } from '@/core/types'
import { getProjectsView, getStandaloneTasks } from '@/server/queries/projects'
import { getViewer } from '@/server/queries/today'

/**
 * Projects — intentionally the thinnest screen in Phase 1.
 *
 * Its only job is to let work be filed somewhere, so the Next Action rules have
 * project ordering to work with. Project cards, health and detail views arrive in
 * Phase 2; building them now would be scope the walking skeleton does not need.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Projects' }

function TaskLine({ task }: { task: Task }) {
  const done = task.status === 'DONE'
  return (
    <li className="flex items-baseline gap-2.5 text-small">
      <span aria-hidden className={done ? 'text-accent' : 'text-faint'}>
        {done ? '✓' : '·'}
      </span>
      <span className={done ? 'text-faint line-through decoration-line' : 'text-muted'}>
        {task.title}
      </span>
    </li>
  )
}

export default async function ProjectsPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')

  const [summaries, standalone] = await Promise.all([getProjectsView(), getStandaloneTasks()])
  const quickAddProjects = summaries.map((summary) => ({
    id: summary.project.id,
    name: summary.project.name,
  }))

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="flex flex-wrap items-center justify-between gap-4 pt-8 pb-6 sm:pt-10">
        <div>
          <h1 className="text-h2 font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-small text-muted">Somewhere for work to live.</p>
        </div>
        <div className="flex gap-3">
          <QuickAdd projects={quickAddProjects} />
          <NewProjectForm />
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {summaries.length === 0 && standalone.length === 0 ? (
          <Card>
            <h2 className="text-h3 font-semibold">No projects yet.</h2>
            <p className="mt-2 text-small text-muted">
              Projects are optional. A task without one still shows up on Today.
            </p>
          </Card>
        ) : null}

        {summaries.map(({ project, openTasks, tasks }) => (
          <Card key={project.id}>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-h3 font-semibold">{project.name}</h2>
              <p className="shrink-0 text-small text-faint">
                {openTasks === 0 ? 'Nothing open' : `${openTasks} open`}
              </p>
            </div>
            {tasks.length > 0 ? (
              <ul className="mt-4 space-y-1.5">
                {tasks
                  .slice()
                  .sort((a, b) => Number(b.status !== 'DONE') - Number(a.status !== 'DONE'))
                  .map((task) => (
                    <TaskLine key={task.id} task={task} />
                  ))}
              </ul>
            ) : (
              <p className="mt-3 text-small text-faint">No tasks filed here yet.</p>
            )}
          </Card>
        ))}

        {standalone.length > 0 ? (
          <Card>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-h3 font-semibold">No project</h2>
              <p className="shrink-0 text-small text-faint">
                {standalone.filter((task) => isStartableStatus(task.status)).length}{' '}
                {pluralise(
                  standalone.filter((task) => isStartableStatus(task.status)).length,
                  'task',
                )}{' '}
                open
              </p>
            </div>
            <ul className="mt-4 space-y-1.5">
              {standalone.map((task) => (
                <TaskLine key={task.id} task={task} />
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  )
}
