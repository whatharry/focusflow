import Link from 'next/link'
import { redirect } from 'next/navigation'
import { NewProjectButton } from '@/components/projects/ProjectForm'
import { QuickAdd } from '@/components/tasks/QuickAdd'
import { TaskRow } from '@/components/tasks/TaskRow'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { pluralise } from '@/core/progress'
import { getProjectsView, getTaskEditorOptions, type ProjectCard } from '@/server/queries/projects'
import { getViewer } from '@/server/queries/today'

/**
 * The project list.
 *
 * Every card answers the same question the rest of the product answers: what is
 * the next thing here. Progress and the remaining count are context for that
 * answer, not the point of the screen — which is why there is one line of each
 * and no chart.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Projects' }

function NextLine({ card }: { card: ProjectCard }) {
  if (card.nextAction.kind !== 'TASK') {
    return (
      <p className="text-small text-faint">
        {card.progress.total > 0 && card.progress.remaining === 0
          ? 'Everything here is done.'
          : 'Nothing startable here.'}
      </p>
    )
  }

  const { task } = card.nextAction
  return (
    <div>
      <p className="ff-label">{card.nextAction.intent === 'RESUME' ? 'In progress' : 'Next'}</p>
      <p className="mt-1 text-body text-ink">
        {task.title}
        {task.estimateMinutes !== null ? (
          <span className="text-faint"> · {task.estimateMinutes} min</span>
        ) : null}
      </p>
    </div>
  )
}

export default async function ProjectsPage(props: PageProps<'/projects'>) {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')

  const params = await props.searchParams
  const showArchived = params.show === 'archived'

  const [view, editorOptions] = await Promise.all([
    getProjectsView(viewer, { archived: showArchived }),
    getTaskEditorOptions(),
  ])

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="flex flex-wrap items-center justify-between gap-4 pt-8 pb-6 sm:pt-10">
        <div>
          <h1 className="text-h2 font-semibold tracking-tight">
            {showArchived ? 'Archived projects' : 'Projects'}
          </h1>
          <p className="mt-1 text-small text-muted">
            {showArchived
              ? 'Out of the way, still here. Nothing was deleted.'
              : 'Somewhere for work to live.'}
          </p>
        </div>
        {showArchived ? (
          <Link
            href="/projects"
            className="text-small text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            ← Active projects
          </Link>
        ) : (
          <div className="flex gap-3">
            <QuickAdd projects={editorOptions.projects} />
            <NewProjectButton />
          </div>
        )}
      </header>

      <div className="ff-rise flex flex-col gap-4">
        {view.cards.length === 0 ? (
          <Card>
            <h2 className="text-h3 font-semibold">
              {showArchived
                ? 'Nothing archived.'
                : view.archivedCount > 0
                  ? 'Nothing active.'
                  : 'No projects yet.'}
            </h2>
            <p className="mt-2 text-small text-muted">
              {showArchived
                ? 'Projects you archive will wait here.'
                : view.archivedCount > 0
                  ? // "No projects yet" would be a lie with archived ones sitting
                    // one link below.
                    'Everything you have is archived. Restore one, or start something new.'
                  : 'Projects are optional. A task without one still shows up on Today.'}
            </p>
          </Card>
        ) : null}

        {view.cards.map((card) => (
          <Link
            key={card.project.id}
            href={`/projects/${card.project.id}`}
            className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Card className="transition-colors duration-[120ms] hover:border-line-strong">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-h3 font-semibold">{card.project.name}</h2>
                {card.currentMilestone ? (
                  <p className="shrink-0 text-small text-faint">{card.currentMilestone.title}</p>
                ) : null}
              </div>

              {card.description ? (
                <p className="mt-1 text-small text-muted">{card.description}</p>
              ) : null}

              <div className="mt-4">
                <ProgressBar progress={card.progress} />
              </div>

              <div className="mt-4">
                <NextLine card={card} />
              </div>
            </Card>
          </Link>
        ))}

        {!showArchived && view.standalone.length > 0 ? (
          <Card>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-h3 font-semibold">No project</h2>
              <p className="shrink-0 text-small text-faint">
                {pluralise(view.standaloneOpen, 'task')} open
              </p>
            </div>
            <p className="mt-1 text-small text-muted">
              Work that does not need a project. It still competes for Today.
            </p>
            <ul className="mt-3 -mx-2">
              {view.standalone.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  today={view.today}
                  projects={editorOptions.projects}
                  milestones={editorOptions.milestones}
                />
              ))}
            </ul>
          </Card>
        ) : null}

        {!showArchived && view.archivedCount > 0 ? (
          <Link
            href="/projects?show=archived"
            className="py-2 text-small text-muted underline-offset-4 hover:text-ink hover:underline"
          >
            {pluralise(view.archivedCount, 'archived project')} →
          </Link>
        ) : null}
      </div>
    </div>
  )
}
