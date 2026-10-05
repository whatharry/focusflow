import { isStartableStatus } from '@/core/next-action'
import type { Project, Task } from '@/core/types'
import { createClient } from '@/lib/supabase/server'
import { toProject, toTask } from '@/server/mappers'

/**
 * Projects read model.
 *
 * Phase 1 shows a flat list with open-task counts, because the only thing a
 * project has to do yet is exist so tasks can be filed against one.
 */

export interface ProjectSummary {
  project: Project
  openTasks: number
  tasks: Task[]
}

export async function getProjectsView(): Promise<ProjectSummary[]> {
  const supabase = await createClient()

  const [projectsResult, tasksResult] = await Promise.all([
    supabase.from('projects').select('*').order('position', { ascending: true }),
    supabase.from('tasks').select('*').neq('status', 'ARCHIVED'),
  ])

  const firstError = projectsResult.error ?? tasksResult.error
  if (firstError) throw new Error(`Could not load projects: ${firstError.message}`)

  const tasks = (tasksResult.data ?? []).map(toTask)

  return (projectsResult.data ?? []).map((row) => {
    const project = toProject(row)
    const projectTasks = tasks.filter((task) => task.projectId === project.id)
    return {
      project,
      openTasks: projectTasks.filter((task) => isStartableStatus(task.status)).length,
      tasks: projectTasks,
    }
  })
}

/** Tasks with no project, so they are not invisible on this screen. */
export async function getStandaloneTasks(): Promise<Task[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .is('project_id', null)
    .neq('status', 'ARCHIVED')

  if (error) throw new Error(`Could not load tasks: ${error.message}`)
  return (data ?? []).map(toTask)
}
