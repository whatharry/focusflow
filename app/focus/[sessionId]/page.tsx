import { FocusScreen } from '@/components/focus/FocusScreen'
import { getFocusView } from '@/server/queries/focus'

export const metadata = { title: 'Focus · FocusFlow' }

/**
 * Focus Mode is a route, not a modal: it survives a refresh, has its own URL, and
 * can be reopened from a cold start on a phone. It also sits outside the (app)
 * group on purpose, so it inherits no navigation chrome whatsoever.
 */
export default async function FocusPage(props: PageProps<'/focus/[sessionId]'>) {
  const { sessionId } = await props.params
  const view = await getFocusView(sessionId)

  return (
    <FocusScreen
      initialSession={view.session}
      initialServerNow={view.serverNow}
      taskTitle={view.taskTitle}
      projectName={view.projectName}
      nextTask={view.nextTask}
      tasksCompletedToday={view.tasksCompletedToday}
    />
  )
}
