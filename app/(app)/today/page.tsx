import { redirect } from 'next/navigation'
import { QuickAdd } from '@/components/tasks/QuickAdd'
import { EmptyNextAction } from '@/components/today/EmptyNextAction'
import { NextActionCard } from '@/components/today/NextActionCard'
import { TodayHeader } from '@/components/today/TodayHeader'
import { UpcomingList } from '@/components/today/UpcomingList'
import { WinsList } from '@/components/today/WinsList'
import { getTodayView, getViewer } from '@/server/queries/today'

/**
 * Today. A Server Component so the answer to "what now?" arrives already decided
 * — no client fetch, no loading spinner between landing and knowing.
 *
 * Reads must never be cached: the next action depends on the current time and on
 * rows that Server Actions mutate.
 */
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Today' }

export default async function TodayPage() {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')

  const view = await getTodayView(viewer)
  const projectNames = new Map(view.projects.map((project) => [project.id, project.name] as const))
  const quickAddProjects = view.projects.map((project) => ({
    id: project.id,
    name: project.name,
  }))

  return (
    <div className="mx-auto w-full max-w-2xl">
      <TodayHeader
        greeting={view.greeting}
        displayName={view.displayName}
        progress={view.progress}
      />

      <div className="ff-rise flex flex-col gap-8">
        {view.nextAction.kind === 'TASK' ? (
          <>
            <NextActionCard
              task={view.nextAction.task}
              projectName={
                view.nextAction.task.projectId === null
                  ? null
                  : (projectNames.get(view.nextAction.task.projectId) ?? null)
              }
              intent={view.nextAction.intent}
              liveSessionId={view.liveSession?.id ?? null}
            />
            <div>
              <QuickAdd projects={quickAddProjects} />
            </div>
          </>
        ) : (
          <EmptyNextAction reason={view.nextAction.reason} projects={quickAddProjects} />
        )}

        <UpcomingList
          tasks={view.upcoming}
          total={view.upcomingTotal}
          projectNames={projectNames}
        />

        <WinsList wins={view.wins} />
      </div>
    </div>
  )
}
