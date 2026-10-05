/**
 * Shape of the Phase 1 schema (supabase/migrations/0001_core.sql).
 *
 * Hand-written to mirror the migration rather than generated, because the project
 * does not require the Supabase CLI. Regenerate with
 *   `supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts`
 * if you later install it; keep this file and the migration in step either way.
 */

export type TaskStatusRow = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'ARCHIVED'
export type TaskPriorityRow = 'LOW' | 'NORMAL' | 'HIGH'
export type ProjectStatusRow = 'ACTIVE' | 'ARCHIVED'
export type SessionStatusRow = 'STARTED' | 'PAUSED' | 'COMPLETED' | 'ABANDONED'

// Row shapes are type aliases, not interfaces, on purpose: TypeScript grants an
// implicit index signature to object type aliases but not to interfaces, and
// supabase-js constrains a schema's tables to Record<string, GenericTable>. With
// interfaces here the constraint fails and every query's row type degrades to
// `never` — with select('*') silently returning `any` and hiding it.

type ProfileRow = {
  id: string
  display_name: string | null
  timezone: string
  created_at: string
  updated_at: string
}

type ProjectRow = {
  id: string
  user_id: string
  name: string
  description: string | null
  goal: string | null
  status: ProjectStatusRow
  color_token: string | null
  position: number
  last_activity_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

type MilestoneRow = {
  id: string
  user_id: string
  project_id: string
  title: string
  position: number
  created_at: string
  updated_at: string
}

type TaskRow = {
  id: string
  user_id: string
  project_id: string | null
  milestone_id: string | null
  split_from_task_id: string | null
  title: string
  description: string | null
  definition_of_done: string | null
  status: TaskStatusRow
  priority: TaskPriorityRow
  estimate_minutes: number | null
  due_date: string | null
  position: number
  blocked_reason: string | null
  stuck_count: number
  completed_at: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

type FocusSessionRow = {
  id: string
  user_id: string
  task_id: string
  planned_minutes: number
  dod_snapshot: string
  status: SessionStatusRow
  started_at: string
  last_resumed_at: string | null
  accumulated_seconds: number
  ended_at: string | null
  pause_count: number
  outcome_note: string | null
  created_at: string
  updated_at: string
}

/** Columns the database fills in for us. */
type Generated = 'id' | 'created_at' | 'updated_at'

type Insert<Row, RequiredKeys extends keyof Row> = Pick<Row, RequiredKeys> &
  Partial<Omit<Row, RequiredKeys | Generated>> & { id?: string }

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow
        Insert: Insert<ProfileRow, 'id'>
        Update: Partial<Omit<ProfileRow, 'id' | Generated>>
        Relationships: []
      }
      projects: {
        Row: ProjectRow
        Insert: Insert<ProjectRow, 'user_id' | 'name'>
        Update: Partial<Omit<ProjectRow, 'id' | 'user_id' | Generated>>
        Relationships: []
      }
      milestones: {
        Row: MilestoneRow
        Insert: Insert<MilestoneRow, 'user_id' | 'project_id' | 'title'>
        Update: Partial<Omit<MilestoneRow, 'id' | 'user_id' | Generated>>
        Relationships: []
      }
      tasks: {
        Row: TaskRow
        Insert: Insert<TaskRow, 'user_id' | 'title'>
        Update: Partial<Omit<TaskRow, 'id' | 'user_id' | Generated>>
        Relationships: []
      }
      focus_sessions: {
        Row: FocusSessionRow
        Insert: Insert<
          FocusSessionRow,
          'user_id' | 'task_id' | 'planned_minutes' | 'dod_snapshot' | 'started_at'
        >
        Update: Partial<Omit<FocusSessionRow, 'id' | 'user_id' | Generated>>
        Relationships: []
      }
    }
    // String index signatures, not `Record<never, never>`: supabase-js constrains
    // a schema to `Record<string, …>`, and an empty object type does not satisfy
    // that — which silently collapses every query's row type to `never`.
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      task_status: TaskStatusRow
      task_priority: TaskPriorityRow
      project_status: ProjectStatusRow
      session_status: SessionStatusRow
    }
    CompositeTypes: Record<string, never>
  }
}
