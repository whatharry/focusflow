import { notFound, redirect } from 'next/navigation'
import { toLocalDate } from '@/core/date'
import type { NextAction } from '@/core/next-action'
import type { TaskCandidate } from '@/core/next-action'
import {
  currentMilestone,
  groupByMilestone,
  nextActionForProject,
  openTaskCount,
  projectProgress,
  type MilestoneGroup,
  type MilestoneRef,
  type ProjectProgress,
} from '@/core/project-structure'
import type { FocusSession, LocalDate, Project, ProjectStatus, Task } from '@/core/types'
import { createClient } from '@/lib/supabase/server'
import { toFocusSession, toProject, toTaskCandidate } from '@/server/mappers'
import { getViewer, type Viewer } from '@/server/queries/today'

/**
 * Projects read model.
 *
 * Both screens load the same working set — projects, milestones, non-archived
 * tasks, the live session — and then hand it to the pure functions in core/.
 * Volumes are personal-scale, so one round trip and in-process reasoning beats
 * pushing the ordering rules into SQL where they could not be unit tested.
 */

export interface ProjectCard {
  project: Project
  description: string | null
  progress: ProjectProgress
  openTasks: number
  /** Same rules as Today, narrowed to this project. */
  nextAction: NextAction
  currentMilestone: MilestoneRef | null
  lastActivityAt: number | null
}

export interface ProjectsView {
  cards: ProjectCard[]
  /** The viewer's local day, so screens never read the clock during render. */
  today: LocalDate
  /** Tasks belonging to no project — they would otherwise be invisible here. */
  standalone: Task[]
  standaloneOpen: number
  /** How many archived projects exist, so the link to them can be honest. */
  archivedCount: number
  liveSessionId: string | null
}

export interface ProjectDetailView {
  project: Project
  today: LocalDate
  description: string | null
  progress: ProjectProgress
  openTasks: number
  nextAction: NextAction
  currentMilestone: MilestoneRef | null
  groups: MilestoneGroup[]
  milestones: MilestoneRef[]
  liveSessionId: string | null
  /** Every active project, for the "move to project" control in the editor. */
  allProjects: { id: string; name: string }[]
}

/** The shared working set. One place where the four reads live. */
interface WorkingSet {
  projects: Project[]
  descriptions: Map<string, string | null>
  lastActivity: Map<string, number | null>
  milestonesByProject: Map<string, MilestoneRef[]>
  tasks: TaskCandidate[]
  liveSession: FocusSession | null
}

async function loadWorkingSet(status: ProjectStatus | 'ALL' = 'ACTIVE'): Promise<WorkingSet> {
  const supabase = await createClient()

  const projectQuery = supabase.from('projects').select('*').order('position', { ascending: true })

  const [projectsResult, milestonesResult, tasksResult, sessionsResult] = await Promise.all([
    status === 'ALL' ? projectQuery : projectQuery.eq('status', status),
    supabase.from('milestones').select('*').order('position', { ascending: true }),
    supabase.from('tasks').select('*').neq('status', 'ARCHIVED'),
    supabase.from('focus_sessions').select('*').in('status', ['STARTED', 'PAUSED']).limit(1),
  ])

  const firstError =
    projectsResult.error ?? milestonesResult.error ?? tasksResult.error ?? sessionsResult.error
  if (firstError) throw new Error(`Could not load projects: ${firstError.message}`)

  const milestoneRows = milestonesResult.data ?? []
  const milestonePositions = new Map(milestoneRows.map((row) => [row.id, row.position] as const))

  const milestonesByProject = new Map<string, MilestoneRef[]>()
  for (const row of milestoneRows) {
    const list = milestonesByProject.get(row.project_id) ?? []
    list.push({ id: row.id, title: row.title, position: row.position })
    milestonesByProject.set(row.project_id, list)
  }

  const projectRows = projectsResult.data ?? []

  return {
    projects: projectRows.map(toProject),
    descriptions: new Map(projectRows.map((row) => [row.id, row.description] as const)),
    lastActivity: new Map(
      projectRows.map(
        (row) =>
          [row.id, row.last_activity_at === null ? null : Date.parse(row.last_activity_at)] as const,
      ),
    ),
    milestonesByProject,
    tasks: (tasksResult.data ?? []).map((row) => toTaskCandidate(row, milestonePositions)),
    liveSession: (sessionsResult.data ?? []).map(toFocusSession)[0] ?? null,
  }
}

/**
 * The project list.
 *
 * `now` is a parameter for the same reason it is on Today: every date rule below
 * this point is pure and takes the instant as input.
 */
export async function getProjectsView(
  viewer: Viewer,
  options: { archived?: boolean } = {},
  now: number = Date.now(),
): Promise<ProjectsView> {
  const archived = options.archived ?? false
  const set = await loadWorkingSet(archived ? 'ARCHIVED' : 'ACTIVE')
  const today = toLocalDate(now, viewer.timeZone)

  // Listing the archived ones already answers the question.
  let archivedCount = set.projects.length
  if (!archived) {
    const supabase = await createClient()
    const { count } = await supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'ARCHIVED')
    archivedCount = count ?? 0
  }

  const input = {
    tasks: set.tasks,
    projects: set.projects,
    plan: null,
    liveSession: set.liveSession,
    today,
    now,
  }

  const cards = set.projects.map((project): ProjectCard => {
    const tasks = set.tasks.filter((task) => task.projectId === project.id)
    const nextAction = nextActionForProject(input, project.id)
    const groups = groupByMilestone(tasks, set.milestonesByProject.get(project.id) ?? [])

    return {
      project,
      description: set.descriptions.get(project.id) ?? null,
      progress: projectProgress(tasks),
      openTasks: openTaskCount(tasks),
      nextAction,
      currentMilestone: currentMilestone(
        groups,
        nextAction.kind === 'TASK' ? nextAction.task.id : null,
      ),
      lastActivityAt: set.lastActivity.get(project.id) ?? null,
    }
  })

  const standalone = set.tasks.filter((task) => task.projectId === null)

  return {
    cards,
    today,
    standalone,
    standaloneOpen: openTaskCount(standalone),
    archivedCount,
    liveSessionId: set.liveSession?.id ?? null,
  }
}

export async function getProjectDetail(
  projectId: string,
  now: number = Date.now(),
): Promise<ProjectDetailView> {
  const viewer = await getViewer()
  if (!viewer) redirect('/login')

  // Every project, archived included — the detail screen is how you get back to
  // an archived one to restore it.
  const set = await loadWorkingSet('ALL')
  const project = set.projects.find((candidate) => candidate.id === projectId)
  // RLS makes another user's project invisible, so this is genuinely a 404.
  if (!project) notFound()

  const today = toLocalDate(now, viewer.timeZone)
  const tasks = set.tasks.filter((task) => task.projectId === project.id)
  const milestones = set.milestonesByProject.get(project.id) ?? []

  const nextAction = nextActionForProject(
    {
      tasks: set.tasks,
      projects: set.projects,
      plan: null,
      liveSession: set.liveSession,
      today,
      now,
    },
    project.id,
  )

  const groups = groupByMilestone(tasks, milestones)

  return {
    project,
    today,
    description: set.descriptions.get(project.id) ?? null,
    progress: projectProgress(tasks),
    openTasks: openTaskCount(tasks),
    nextAction,
    currentMilestone: currentMilestone(
      groups,
      nextAction.kind === 'TASK' ? nextAction.task.id : null,
    ),
    groups,
    milestones: [...milestones].sort((a, b) => a.position - b.position),
    liveSessionId: set.liveSession?.id ?? null,
    allProjects: set.projects
      .filter((candidate) => candidate.status === 'ACTIVE')
      .map((candidate) => ({ id: candidate.id, name: candidate.name })),
  }
}

/**
 * Everything the task editor needs to offer "move to project / milestone".
 *
 * Returned as one payload so the editor can repopulate its milestone list when
 * the project changes without a round trip — the whole set is a few dozen rows.
 */
export interface TaskEditorOptions {
  projects: { id: string; name: string }[]
  milestones: { id: string; title: string; projectId: string }[]
}

export async function getTaskEditorOptions(): Promise<TaskEditorOptions> {
  const supabase = await createClient()
  const [projectsResult, milestonesResult] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name')
      .eq('status', 'ACTIVE')
      .order('position', { ascending: true }),
    supabase
      .from('milestones')
      .select('id, title, project_id')
      .order('position', { ascending: true }),
  ])

  const firstError = projectsResult.error ?? milestonesResult.error
  if (firstError) throw new Error(`Could not load projects: ${firstError.message}`)

  return {
    projects: projectsResult.data ?? [],
    milestones: (milestonesResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      projectId: row.project_id,
    })),
  }
}
