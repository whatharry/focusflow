import Link from 'next/link'
import { MilestoneSection, NewMilestoneForm } from '@/components/projects/MilestoneSection'
import { ProjectSettings } from '@/components/projects/ProjectSettings'
import { QuickAdd } from '@/components/tasks/QuickAdd'
import { NextActionCard } from '@/components/today/NextActionCard'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import type { NoneReason } from '@/core/next-action'
import { getProjectDetail, getTaskEditorOptions } from '@/server/queries/projects'

/**
 * Project detail.
 *
 * Same shape as Today, narrowed to one project: the next action gets the only
 * primary button on the screen, and the structure below it is reference material
 * you can ignore. That ordering is the whole argument — a project page that
 * opens with a task list is a backlog, and a backlog is a thing you avoid.
 */
export const dynamic = 'force-dynamic'

const EMPTY_COPY: Record<NoneReason, string> = {
  NO_TASKS: 'Nothing to do here yet. Add the first task and it becomes the next one.',
  ALL_BLOCKED: 'Everything here is blocked. Unblock one, or work on something else today.',
  ALL_DONE: 'Every task in this project is finished.',
  PLAN_COMPLETE: 'Today’s priorities are done. This project can wait until tomorrow.',
  DAY_CLOSED: 'You closed the day. This will still be here tomorrow.',
  ALL_OVERSIZED: 'Everything left is too big to start. Break one down first.',
}

export async function generateMetadata(props: PageProps<'/projects/[projectId]'>) {
  const { projectId } = await props.params
  const view = await getProjectDetail(projectId)
  return { title: view.project.name }
}

export default async function ProjectDetailPage(props: PageProps<'/projects/[projectId]'>) {
  const { projectId } = await props.params

  const [view, editorOptions] = await Promise.all([
    getProjectDetail(projectId),
    getTaskEditorOptions(),
  ])

  const archived = view.project.status === 'ARCHIVED'
  const nextTaskId = view.nextAction.kind === 'TASK' ? view.nextAction.task.id : null

  return (
    <div className="mx-auto w-full max-w-2xl">
      <header className="pt-8 pb-6 sm:pt-10">
        <Link
          href="/projects"
          className="text-small text-muted underline-offset-4 hover:text-ink hover:underline"
        >
          ← Projects
        </Link>

        <h1 className="mt-4 text-h2 font-semibold tracking-tight text-balance">
          {view.project.name}
        </h1>

        {view.description ? (
          <p className="mt-2 text-small text-muted">{view.description}</p>
        ) : null}

        <div className="mt-4 max-w-sm">
          <ProgressBar progress={view.progress} />
        </div>
      </header>

      <div className="ff-rise flex flex-col gap-8">
        {archived ? (
          <Card>
            <p className="ff-label">Archived</p>
            <p className="mt-2 text-small text-muted">
              This project is out of the way. Its tasks are intact and its focus history is
              untouched — they simply stopped competing for Today. Restore it to pick it back up.
            </p>
          </Card>
        ) : view.nextAction.kind === 'TASK' ? (
          <NextActionCard
            task={view.nextAction.task}
            projectName={view.project.name}
            intent={view.nextAction.intent}
            liveSessionId={view.liveSessionId}
          />
        ) : (
          <Card>
            <p className="ff-label">Next</p>
            <p className="mt-2 text-body text-muted">{EMPTY_COPY[view.nextAction.reason]}</p>
          </Card>
        )}

        {archived ? null : (
          <div>
            <QuickAdd projects={view.allProjects} defaultProjectId={view.project.id} />
          </div>
        )}

        <div className="flex flex-col gap-7">
          {view.groups.length === 0 ? (
            <p className="text-small text-faint">No tasks in this project yet.</p>
          ) : (
            view.groups.map((group, index) => {
              // Only real milestones can be reordered; the unassigned group is
              // always last and has no position of its own.
              const milestoneIndex = group.milestone === null ? -1 : index
              return (
                <MilestoneSection
                  key={group.milestone?.id ?? 'unassigned'}
                  group={group}
                  today={view.today}
                  projects={editorOptions.projects}
                  milestones={editorOptions.milestones}
                  nextTaskId={nextTaskId}
                  isFirst={milestoneIndex === 0}
                  isLast={milestoneIndex === view.milestones.length - 1}
                  readOnly={archived}
                />
              )
            })
          )}

          {archived ? null : <NewMilestoneForm projectId={view.project.id} />}
        </div>

        <div className="border-t border-line pt-6">
          <ProjectSettings
            project={{
              id: view.project.id,
              name: view.project.name,
              description: view.description,
            }}
            status={view.project.status}
            openTasks={view.openTasks}
          />
        </div>
      </div>
    </div>
  )
}
