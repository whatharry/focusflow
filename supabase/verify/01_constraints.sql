\set ON_ERROR_STOP on
\pset pager off

-- ── 1. signup trigger creates a profile atomically ───────────────────────────
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'a@example.com',
        '{"display_name":"Harry","timezone":"Asia/Karachi"}'::jsonb);
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'b@example.com');

select '1. profile trigger' as check,
       (select count(*) from public.profiles) = 2 as two_profiles,
       (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Harry' as name_ok,
       (select timezone from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Asia/Karachi' as tz_ok,
       (select timezone from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 'UTC' as tz_default_ok;

-- ── 2. new tasks default to TODO ─────────────────────────────────────────────
insert into public.projects (id, user_id, name, position)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Launch my SaaS', 1000);

insert into public.tasks (id, user_id, project_id, title, estimate_minutes)
values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-000000000001', 'Create signup API', 45);

select '2. task defaults' as check,
       status::text = 'TODO' as status_is_todo,
       priority::text = 'NORMAL' as priority_normal,
       position = 1000 as position_ok,
       stuck_count = 0 as stuck_zero
from public.tasks where id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- ── 3. DONE requires completed_at ────────────────────────────────────────────
do $$
begin
  update public.tasks set status = 'DONE' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
  raise exception 'FAIL: DONE without completed_at was accepted';
exception when check_violation then
  raise notice '3. DONE without completed_at correctly rejected';
end $$;

-- ── 4. the pause-integrity CHECK ─────────────────────────────────────────────
insert into public.focus_sessions (id, user_id, task_id, planned_minutes, dod_snapshot, started_at, last_resumed_at)
values ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
        'bbbbbbbb-0000-0000-0000-000000000001', 45,
        'POST /auth/signup returns 201 and a session', now(), now());

do $$
begin
  -- A paused session that still carries a resume marker would let wall-clock time
  -- accrue while paused. The database must refuse it.
  update public.focus_sessions set status = 'PAUSED' where id = 'cccccccc-0000-0000-0000-000000000001';
  raise exception 'FAIL: PAUSED with a non-null last_resumed_at was accepted';
exception when check_violation then
  raise notice '4a. PAUSED retaining last_resumed_at correctly rejected';
end $$;

do $$
begin
  update public.focus_sessions set status = 'STARTED', last_resumed_at = null
  where id = 'cccccccc-0000-0000-0000-000000000001';
  raise exception 'FAIL: STARTED without a resume marker was accepted';
exception when check_violation then
  raise notice '4b. STARTED without last_resumed_at correctly rejected';
end $$;

-- The legal pause: bank the interval and clear the marker in one statement.
update public.focus_sessions
   set status = 'PAUSED', accumulated_seconds = 600, last_resumed_at = null
 where id = 'cccccccc-0000-0000-0000-000000000001';
select '4c. legal pause' as check, status::text = 'PAUSED' as paused,
       last_resumed_at is null as marker_cleared, accumulated_seconds = 600 as banked
from public.focus_sessions where id = 'cccccccc-0000-0000-0000-000000000001';

-- ── 5. one live session per user ─────────────────────────────────────────────
do $$
begin
  insert into public.focus_sessions (user_id, task_id, planned_minutes, dod_snapshot, started_at, last_resumed_at)
  values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001',
          60, 'second session', now(), now());
  raise exception 'FAIL: a second live session was accepted';
exception when unique_violation then
  raise notice '5a. second live session correctly rejected (23505)';
end $$;

-- A different user may of course have their own live session.
insert into public.tasks (id, user_id, title)
values ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Workout');
insert into public.focus_sessions (user_id, task_id, planned_minutes, dod_snapshot, started_at, last_resumed_at)
values ('22222222-2222-2222-2222-222222222222', 'bbbbbbbb-0000-0000-0000-000000000002', 25, 'ran 3km', now(), now());
select '5b. other user live session' as check, count(*) = 2 as both_live
from public.focus_sessions where status in ('STARTED','PAUSED');

-- Once terminal, the slot frees up and a new session can start.
update public.focus_sessions
   set status = 'COMPLETED', last_resumed_at = null, ended_at = now()
 where id = 'cccccccc-0000-0000-0000-000000000001';
insert into public.focus_sessions (user_id, task_id, planned_minutes, dod_snapshot, started_at, last_resumed_at)
values ('11111111-1111-1111-1111-111111111111', 'bbbbbbbb-0000-0000-0000-000000000001', 60, 'next one', now(), now());
select '5c. slot frees after finishing' as check, count(*) = 1 as one_live
from public.focus_sessions
where user_id = '11111111-1111-1111-1111-111111111111' and status in ('STARTED','PAUSED');

-- ── 6. terminal sessions must record ended_at ────────────────────────────────
do $$
begin
  update public.focus_sessions set status = 'ABANDONED', last_resumed_at = null, ended_at = null
  where id = 'cccccccc-0000-0000-0000-000000000001';
  raise exception 'FAIL: terminal session without ended_at was accepted';
exception when check_violation then
  raise notice '6. terminal session without ended_at correctly rejected';
end $$;
