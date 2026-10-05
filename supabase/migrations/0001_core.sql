-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ FocusFlow — 0001_core                                                    ║
-- ║                                                                          ║
-- ║ Phase 1 schema: profiles, projects, milestones, tasks, focus_sessions.   ║
-- ║                                                                          ║
-- ║ Two constraints in here are load-bearing product rules, not hygiene:     ║
-- ║                                                                          ║
-- ║  1. focus_sessions_started_has_resume_marker — makes paused time          ║
-- ║     structurally uncountable. While paused, last_resumed_at IS NULL, so  ║
-- ║     the elapsed formula has nothing to add.                              ║
-- ║  2. focus_sessions_one_live_per_user — you cannot focus on two things.   ║
-- ║     Enforced here rather than in application code because it is the      ║
-- ║     central invariant of the entire product.                             ║
-- ║                                                                          ║
-- ║ Forward-only. Apply with `supabase db push`, or paste into the SQL       ║
-- ║ editor in the Supabase dashboard.                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Enums ─────────────────────────────────────────────────────────────────────

create type public.task_status as enum (
  'BACKLOG',      -- explicitly demoted: "not now, stop suggesting this"
  'TODO',         -- ready and eligible to be the next action (the default)
  'IN_PROGRESS',
  'BLOCKED',
  'DONE',
  'ARCHIVED'
);

create type public.task_priority as enum ('LOW', 'NORMAL', 'HIGH');

create type public.project_status as enum ('ACTIVE', 'ARCHIVED');

create type public.session_status as enum ('STARTED', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- ── Shared trigger: updated_at ────────────────────────────────────────────────

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── profiles ──────────────────────────────────────────────────────────────────
-- One row per auth user. `timezone` is what makes "today" mean today where the
-- user actually is; every daily rollup resolves through it.

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  timezone     text not null default 'UTC',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ── projects ──────────────────────────────────────────────────────────────────

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 120),
  description      text,
  goal             text,
  status           public.project_status not null default 'ACTIVE',
  color_token      text,
  -- Gaps of 1000 so inserting between two rows is (a+b)/2 — no unique constraint,
  -- so reordering never needs a deferred-constraint transaction.
  position         integer not null default 1000,
  last_activity_at timestamptz,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger projects_touch_updated_at
  before update on public.projects
  for each row execute function public.touch_updated_at();

create index projects_user_status_position_idx
  on public.projects (user_id, status, position);

-- ── milestones ────────────────────────────────────────────────────────────────
-- Table exists in Phase 1 so tasks.milestone_id has a target and the next-action
-- ordering can read milestone position. No milestone UI until Phase 2.
--
-- Deliberately has no status/completed_at: a milestone's completeness is a
-- function of its tasks, and a second source of truth would only drift.

create table public.milestones (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title      text not null check (length(btrim(title)) between 1 and 120),
  position   integer not null default 1000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger milestones_touch_updated_at
  before update on public.milestones
  for each row execute function public.touch_updated_at();

create index milestones_project_position_idx
  on public.milestones (project_id, position);

create index milestones_user_idx on public.milestones (user_id);

-- ── tasks ─────────────────────────────────────────────────────────────────────
-- project_id is nullable on purpose: "Workout" is a real task and must be able to
-- win the next action without inventing a project for it.
--
-- definition_of_done is a first-class column, not a note. It is what the
-- pre-flight demands, what Focus Mode displays, and what makes "Finish" honest.

create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  project_id         uuid references public.projects (id) on delete cascade,
  milestone_id       uuid references public.milestones (id) on delete set null,
  -- Breakdown lineage (Phase 5). Siblings, not a subtask tree: nesting would
  -- reintroduce exactly the overwhelm the product exists to remove.
  split_from_task_id uuid references public.tasks (id) on delete set null,

  title              text not null check (length(btrim(title)) between 1 and 200),
  description        text,
  definition_of_done text,

  status             public.task_status not null default 'TODO',
  priority           public.task_priority not null default 'NORMAL',
  estimate_minutes   integer check (estimate_minutes between 5 and 600),
  due_date           date,
  position           integer not null default 1000,

  blocked_reason     text,
  stuck_count        integer not null default 0 check (stuck_count >= 0),

  completed_at       timestamptz,
  archived_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- A DONE task without a completion time would silently break every daily
  -- rollup, so the database refuses to store one.
  constraint tasks_done_has_completed_at
    check (status <> 'DONE' or completed_at is not null)
);

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- The next-action query: all startable tasks for a user.
create index tasks_user_status_idx on public.tasks (user_id, status);

-- Project detail and project-scoped next action.
create index tasks_project_milestone_position_idx
  on public.tasks (project_id, milestone_id, position);

-- Deadline pressure, excluding work that is finished or filed away.
create index tasks_user_due_date_idx
  on public.tasks (user_id, due_date)
  where status not in ('DONE', 'ARCHIVED');

-- Today's wins.
create index tasks_user_completed_at_idx
  on public.tasks (user_id, completed_at desc)
  where status = 'DONE';

-- ── focus_sessions ────────────────────────────────────────────────────────────

create table public.focus_sessions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  task_id             uuid not null references public.tasks (id) on delete cascade,

  planned_minutes     integer not null check (planned_minutes between 5 and 240),
  -- What DONE meant when the session began. Tasks get edited; the commitment
  -- you actually made should not be rewritten after the fact.
  dod_snapshot        text not null,

  status              public.session_status not null default 'STARTED',
  started_at          timestamptz not null default now(),
  -- Non-null exactly while running. This is the pause-integrity marker.
  last_resumed_at     timestamptz,
  -- Focused seconds banked from completed intervals, excluding every pause.
  accumulated_seconds integer not null default 0 check (accumulated_seconds >= 0),
  ended_at            timestamptz,

  pause_count         integer not null default 0 check (pause_count >= 0),
  outcome_note        text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- ★ Paused time cannot be counted, as an invariant rather than a convention.
  constraint focus_sessions_started_has_resume_marker
    check ((status = 'STARTED') = (last_resumed_at is not null)),

  -- A finished session must record when it finished.
  constraint focus_sessions_terminal_has_ended_at
    check (status in ('STARTED', 'PAUSED') or ended_at is not null)
);

create trigger focus_sessions_touch_updated_at
  before update on public.focus_sessions
  for each row execute function public.touch_updated_at();

-- ★ One live session per user. The product's central rule, enforced by the
-- database so no code path — route handler, retry, or second device — can
-- violate it. Starting a second session raises 23505, which the application
-- turns into "you already have a session running" and a redirect to it.
create unique index focus_sessions_one_live_per_user
  on public.focus_sessions (user_id)
  where status in ('STARTED', 'PAUSED');

create index focus_sessions_user_started_at_idx
  on public.focus_sessions (user_id, started_at desc);

create index focus_sessions_task_idx on public.focus_sessions (task_id);

-- ── Signup trigger ────────────────────────────────────────────────────────────
-- A profile row must exist for every user, created atomically with the user so no
-- code path can observe a user without one.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    coalesce(nullif(btrim(coalesce(new.raw_user_meta_data ->> 'timezone', '')), ''), 'UTC')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Row Level Security ────────────────────────────────────────────────────────
-- Every table carries user_id so every policy is a single-table predicate on
-- auth.uid(). Joining another table inside a policy is the classic Supabase
-- performance trap and makes the rules recursive; denormalising user_id avoids
-- both. Policies are explicit per operation — never FOR ALL.
--
-- auth.uid() is wrapped in a scalar subselect so Postgres evaluates it once per
-- statement (initPlan) instead of once per row.

alter table public.profiles       enable row level security;
alter table public.projects       enable row level security;
alter table public.milestones     enable row level security;
alter table public.tasks          enable row level security;
alter table public.focus_sessions enable row level security;

-- profiles: no insert policy — rows are created by the signup trigger only, and
-- deletion follows the auth user via ON DELETE CASCADE.
create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy projects_select_own on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy projects_insert_own on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy projects_update_own on public.projects
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy projects_delete_own on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy milestones_select_own on public.milestones
  for select to authenticated using ((select auth.uid()) = user_id);
create policy milestones_insert_own on public.milestones
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy milestones_update_own on public.milestones
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy milestones_delete_own on public.milestones
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy tasks_select_own on public.tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy tasks_insert_own on public.tasks
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy tasks_update_own on public.tasks
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy tasks_delete_own on public.tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy focus_sessions_select_own on public.focus_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy focus_sessions_insert_own on public.focus_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy focus_sessions_update_own on public.focus_sessions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy focus_sessions_delete_own on public.focus_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);
