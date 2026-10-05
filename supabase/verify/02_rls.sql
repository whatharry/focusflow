\pset pager off
-- Grants that Supabase applies by default to the authenticated role.
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;

set role authenticated;

-- Act as user A.
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
select 'A sees own rows' as check,
       (select count(*) from public.tasks)    as tasks,
       (select count(*) from public.projects) as projects,
       (select count(*) from public.profiles) as profiles,
       (select count(*) from public.focus_sessions) as sessions;

-- Act as user B: must see only their own, never A's.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select 'B sees own rows only' as check,
       (select count(*) from public.tasks)    as tasks,
       (select count(*) from public.projects) as projects,
       (select count(*) from public.profiles) as profiles,
       (select count(*) from public.focus_sessions) as sessions;

-- B cannot read A's task even by addressing it directly by id.
select 'B targeting A task by id' as check, count(*) = 0 as invisible
from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- B cannot update A's task.
do $$
declare affected int;
begin
  update public.tasks set title = 'hijacked' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  if affected > 0 then raise exception 'FAIL: B updated A''s task'; end if;
  raise notice 'B updating A task affected 0 rows (invisible, not merely forbidden)';
end $$;

-- B cannot delete A's task.
do $$
declare affected int;
begin
  delete from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  get diagnostics affected = row_count;
  if affected > 0 then raise exception 'FAIL: B deleted A''s task'; end if;
  raise notice 'B deleting A task affected 0 rows';
end $$;

-- B cannot forge a row owned by A.
do $$
begin
  insert into public.tasks (user_id, title) values ('11111111-1111-1111-1111-111111111111', 'forged');
  raise exception 'FAIL: B inserted a task owned by A';
exception when insufficient_privilege then
  raise notice 'B forging a row for A correctly rejected by WITH CHECK';
end $$;

-- An anonymous caller (no JWT) sees nothing at all.
set request.jwt.claim.sub = '';
select 'anonymous' as check,
       (select count(*) from public.tasks) = 0 as no_tasks,
       (select count(*) from public.profiles) = 0 as no_profiles;

-- Nobody can insert a profile directly; only the signup trigger creates them.
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
do $$
begin
  insert into public.profiles (id, timezone) values ('33333333-3333-3333-3333-333333333333', 'UTC');
  raise exception 'FAIL: a profile was inserted directly';
exception when insufficient_privilege then
  raise notice 'direct profile insert correctly rejected (no INSERT policy)';
end $$;

reset role;
