-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ FocusFlow — 0002_projects_structure                                      ║
-- ║                                                                          ║
-- ║ Phase 2 needs no new tables and no new columns: 0001 already shipped     ║
-- ║ projects, milestones, and every task field the editor exposes.           ║
-- ║                                                                          ║
-- ║ What Phase 2 *does* introduce is the ability to point a task at a        ║
-- ║ project and a milestone. That opens a hole RLS cannot close:             ║
-- ║                                                                          ║
-- ║   • RLS proves `tasks.user_id = auth.uid()`. It says nothing about       ║
-- ║     whether the project_id you wrote into your own row belongs to you.   ║
-- ║     A crafted request could file your task under someone else's project. ║
-- ║     Nothing of theirs leaks — their project row stays unreadable — but   ║
-- ║     your own data ends up referencing a row you have no business         ║
-- ║     touching, and a later join would quietly drop the task.              ║
-- ║                                                                          ║
-- ║   • Nothing stops milestone_id and project_id disagreeing: a task in     ║
-- ║     project A carrying a milestone from project B. Project detail would  ║
-- ║     then render a task under a heading that does not exist on the page.  ║
-- ║                                                                          ║
-- ║ Both are fixed the same way — composite foreign keys, so the pairing is  ║
-- ║ checked by Postgres on every insert and every update. This is the same   ║
-- ║ instinct as 0001's one-live-session index: a rule the product depends    ║
-- ║ on belongs where no code path can route around it.                       ║
-- ║                                                                          ║
-- ║ Forward-only and safe to apply to live data — existing rows are repaired ║
-- ║ before the constraints go on. No column is added, dropped or retyped.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── Referencable keys ─────────────────────────────────────────────────────────
-- A composite FK needs a unique constraint on exactly the columns it targets.
-- `id` is already the primary key, so each of these is logically redundant —
-- its only job is to give the foreign keys below something to point at.

alter table public.projects
  add constraint projects_id_user_id_key unique (id, user_id);

alter table public.milestones
  add constraint milestones_id_user_id_key unique (id, user_id);

alter table public.milestones
  add constraint milestones_id_project_id_key unique (id, project_id);

-- ── Repair existing rows ──────────────────────────────────────────────────────
-- Phase 1 had no UI for any of this, so in practice these update nothing. They
-- exist so the migration is safe to run against a database that has been poked
-- at by hand, rather than failing halfway and leaving the schema half-migrated.

-- A milestone whose project belongs to someone else cannot be orphaned instead
-- — project_id is NOT NULL — so deleting it is the only available repair. Its
-- tasks survive: the FK below nulls their milestone_id and leaves them filed.
delete from public.milestones m
 using public.projects p
 where m.project_id = p.id
   and m.user_id <> p.user_id;

update public.tasks t
   set project_id = null, milestone_id = null
  from public.projects p
 where t.project_id = p.id
   and t.user_id <> p.user_id;

update public.tasks t
   set milestone_id = null
  from public.milestones m
 where t.milestone_id = m.id
   and (t.user_id <> m.user_id or t.project_id is distinct from m.project_id);

update public.tasks set milestone_id = null
 where milestone_id is not null and project_id is null;

-- ── milestones → projects, same owner ─────────────────────────────────────────

alter table public.milestones
  drop constraint milestones_project_id_fkey;

alter table public.milestones
  add constraint milestones_project_fkey
  foreign key (project_id, user_id)
  references public.projects (id, user_id)
  on delete cascade;

-- ── tasks → projects, same owner ──────────────────────────────────────────────

alter table public.tasks
  drop constraint tasks_project_id_fkey;

alter table public.tasks
  add constraint tasks_project_fkey
  foreign key (project_id, user_id)
  references public.projects (id, user_id)
  on delete cascade;

-- ── tasks → milestones, same owner and same project ───────────────────────────
-- Two separate constraints rather than one three-column key, because they fail
-- for different reasons and the errors should say which.
--
-- `on delete set null (milestone_id)` is the important detail: the default would
-- null every referencing column, so deleting a milestone would also unfile the
-- task from its project. Column-scoped SET NULL needs Postgres 15 or newer.

alter table public.tasks
  drop constraint tasks_milestone_id_fkey;

alter table public.tasks
  add constraint tasks_milestone_owner_fkey
  foreign key (milestone_id, user_id)
  references public.milestones (id, user_id)
  on delete set null (milestone_id);

alter table public.tasks
  add constraint tasks_milestone_project_fkey
  foreign key (milestone_id, project_id)
  references public.milestones (id, project_id)
  on delete set null (milestone_id);

-- A composite foreign key with MATCH SIMPLE — the default — is skipped entirely
-- when any of its columns is NULL. So the pair above checks nothing at all for a
-- task with no project, and a standalone task could keep a milestone id pointing
-- into a project it no longer belongs to.
--
-- MATCH FULL would express this exactly, but it is incompatible with the
-- column-scoped SET NULL above: clearing only milestone_id would leave the pair
-- half-null and MATCH FULL rejects that. A CHECK says the same thing and
-- composes with the referential action instead of fighting it.
alter table public.tasks
  add constraint tasks_milestone_requires_project
  check (milestone_id is null or project_id is not null);

-- ── Index for the project list ────────────────────────────────────────────────
-- The project list reads every non-archived task for the user and groups them in
-- TypeScript. `tasks_user_status_idx` already covers that. What it does not cover
-- is the archived-projects view, which filters on a column 0001 never indexed.

create index projects_user_archived_at_idx
  on public.projects (user_id, archived_at desc)
  where status = 'ARCHIVED';
