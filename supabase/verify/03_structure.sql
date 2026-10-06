\set ON_ERROR_STOP on
\pset pager off

-- Phase 2 structure: the composite foreign keys from 0002, archive behaviour,
-- and milestone isolation between users.
--
-- Continues from 01_constraints.sql's fixtures:
--   A = 1111…  owns project aaaaaaaa-…0001 and task bbbbbbbb-…0001
--   B = 2222…  owns task bbbbbbbb-…0002 (standalone)

-- ── 7. a task cannot be filed under another user's project ───────────────────
insert into public.projects (id, user_id, name, position)
values ('aaaaaaaa-0000-0000-0000-000000000009', '22222222-2222-2222-2222-222222222222', 'B project', 1000);

do $$
begin
  insert into public.tasks (user_id, project_id, title)
  values ('11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000009', 'filed under B');
  raise exception 'FAIL: a task was filed under another user''s project';
exception when foreign_key_violation then
  raise notice '7a. cross-user project assignment correctly rejected';
end $$;

-- The same applies on UPDATE — moving a task is how this would really happen.
do $$
begin
  update public.tasks set project_id = 'aaaaaaaa-0000-0000-0000-000000000009'
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  raise exception 'FAIL: a task was moved into another user''s project';
exception when foreign_key_violation then
  raise notice '7b. cross-user project move correctly rejected';
end $$;

-- ── 8. a milestone cannot live in another user's project ─────────────────────
do $$
begin
  insert into public.milestones (user_id, project_id, title)
  values ('11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000009', 'A milestone in B project');
  raise exception 'FAIL: a milestone was created in another user''s project';
exception when foreign_key_violation then
  raise notice '8. cross-user milestone correctly rejected';
end $$;

-- ── 9. a task's milestone must belong to the task's own project ──────────────
insert into public.projects (id, user_id, name, position)
values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Second project', 2000);

insert into public.milestones (id, user_id, project_id, title, position)
values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'Authentication', 1000);

do $$
begin
  -- Same owner, same project family, but the milestone belongs to the *other*
  -- project. Project detail would render this task under a heading that is not
  -- on the page, so the database refuses the pairing.
  insert into public.tasks (user_id, project_id, milestone_id, title)
  values ('11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000002',
          'dddddddd-0000-0000-0000-000000000001', 'mismatched milestone');
  raise exception 'FAIL: a milestone from another project was accepted';
exception when foreign_key_violation then
  raise notice '9a. cross-project milestone correctly rejected';
end $$;

-- A task with no project at all cannot carry a milestone either. The composite
-- FK alone does NOT cover this — MATCH SIMPLE skips the check the moment one
-- column is null — which is why 0002 also carries an explicit CHECK.
do $$
begin
  insert into public.tasks (user_id, project_id, milestone_id, title)
  values ('11111111-1111-1111-1111-111111111111', null,
          'dddddddd-0000-0000-0000-000000000001', 'milestone without project');
  raise exception 'FAIL: a milestone on a project-less task was accepted';
exception when check_violation then
  raise notice '9b. milestone without a project correctly rejected';
end $$;

-- The legal pairing.
update public.tasks
   set milestone_id = 'dddddddd-0000-0000-0000-000000000001'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select '9c. legal milestone assignment' as check,
       milestone_id = 'dddddddd-0000-0000-0000-000000000001' as assigned
from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- Now that the task genuinely has a milestone: clearing only its project must be
-- refused. The editor offers "No project", so it has to clear both together —
-- this is the constraint that stops it quietly leaving a dangling milestone.
do $$
begin
  update public.tasks set project_id = null
   where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  raise exception 'FAIL: a task kept its milestone after leaving the project';
exception when check_violation then
  raise notice '9d. dropping the project while keeping the milestone correctly rejected';
end $$;

-- Clearing both at once is the supported move.
update public.tasks set project_id = null, milestone_id = null
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';
select '9e. unfiled cleanly' as check,
       project_id is null and milestone_id is null as cleared
from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- Put it back where the remaining checks expect it.
update public.tasks
   set project_id = 'aaaaaaaa-0000-0000-0000-000000000001',
       milestone_id = 'dddddddd-0000-0000-0000-000000000001'
 where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ── 10. deleting a milestone unfiles its tasks without losing them ───────────
delete from public.milestones where id = 'dddddddd-0000-0000-0000-000000000001';

select '10. milestone delete' as check,
       (select count(*) from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001') = 1
         as task_survives,
       (select milestone_id is null from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001')
         as milestone_cleared,
       -- The important half: column-scoped SET NULL, so the task stays in its
       -- project rather than being unfiled entirely.
       (select project_id = 'aaaaaaaa-0000-0000-0000-000000000001'
          from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001')
         as project_kept;

-- ── 11. archiving a project changes nothing but the project ──────────────────
-- Archive must never be implemented as a delete: the tasks and every session
-- ever recorded against them have to survive it intact.
update public.projects
   set status = 'ARCHIVED', archived_at = now()
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';

select '11. archive preserves history' as check,
       (select count(*) from public.tasks
         where project_id = 'aaaaaaaa-0000-0000-0000-000000000001') > 0 as tasks_intact,
       (select count(*) from public.focus_sessions
         where task_id = 'bbbbbbbb-0000-0000-0000-000000000001') > 0 as sessions_intact,
       (select status::text from public.projects
         where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'ARCHIVED' as archived,
       (select archived_at is not null from public.projects
         where id = 'aaaaaaaa-0000-0000-0000-000000000001') as stamped;

-- Restoring is symmetric and equally lossless.
update public.projects
   set status = 'ACTIVE', archived_at = null
 where id = 'aaaaaaaa-0000-0000-0000-000000000001';
select '11b. restore' as check,
       (select status::text from public.projects
         where id = 'aaaaaaaa-0000-0000-0000-000000000001') = 'ACTIVE' as active_again,
       (select count(*) from public.tasks
         where project_id = 'aaaaaaaa-0000-0000-0000-000000000001') > 0 as tasks_still_there;

-- ── 12. milestone RLS isolation ──────────────────────────────────────────────
insert into public.milestones (id, user_id, project_id, title, position)
values ('dddddddd-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'A''s milestone', 1000);

grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
set role authenticated;

set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select '12a. B cannot see A''s milestone' as check,
       (select count(*) from public.milestones) = 0 as invisible,
       (select count(*) from public.milestones
         where id = 'dddddddd-0000-0000-0000-000000000002') = 0 as invisible_by_id;

do $$
declare affected int;
begin
  update public.milestones set title = 'hijacked'
   where id = 'dddddddd-0000-0000-0000-000000000002';
  get diagnostics affected = row_count;
  if affected > 0 then raise exception 'FAIL: B renamed A''s milestone'; end if;
  raise notice '12b. B renaming A milestone affected 0 rows';
end $$;

do $$
begin
  insert into public.milestones (user_id, project_id, title)
  values ('11111111-1111-1111-1111-111111111111',
          'aaaaaaaa-0000-0000-0000-000000000001', 'forged');
  raise exception 'FAIL: B created a milestone owned by A';
exception when insufficient_privilege then
  raise notice '12c. B forging a milestone for A correctly rejected';
end $$;

set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select '12d. A still sees their own' as check,
       (select count(*) from public.milestones) = 1 as visible;

reset role;
