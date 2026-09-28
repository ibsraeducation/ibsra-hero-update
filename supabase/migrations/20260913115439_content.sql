-- ==========================================================================
-- Content: programs (tracks) → courses (loops) → sessions, and enrolments.
--
-- A session's teaching content (topics, videos, materials, tasks, the
-- student-facing order) is one JSONB document, the same nested shape the
-- editor already works on. Answer keys never live in it: which options are
-- correct and the grading note sit in `session_keys`, which only admins read.
-- ==========================================================================

create type public.track_tier        as enum ('T2', 'T3');
create type public.loop_status       as enum ('planning', 'running', 'closed');
create type public.session_type      as enum ('recorded', 'live');
create type public.publish_status    as enum ('draft', 'scheduled', 'published', 'archived');
create type public.enrollment_status as enum ('active', 'completed', 'dropped');

create table public.tracks (
  id         text primary key check (id ~ '^[a-z]{2,4}_[A-Za-z0-9]{4,40}$'),
  name       text not null default 'Untitled program' check (char_length(name) <= 160),
  skill      text not null default '' check (char_length(skill) <= 120),
  tier       public.track_tier not null default 'T2',
  color      text not null default 'brand' check (color in ('brand', 'gold', 'teal', 'rose', 'sky')),
  blurb      text not null default '' check (char_length(blurb) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- "Course" in the UI.
create table public.loops (
  id         text primary key check (id ~ '^[a-z]{2,4}_[A-Za-z0-9]{4,40}$'),
  track_id   text not null references public.tracks (id) on delete restrict,
  code       text not null default '' check (char_length(code) <= 40),
  name       text not null default '' check (char_length(name) <= 160),
  idx        int  not null default 1 check (idx >= 1),
  start_date timestamptz not null,
  end_date   timestamptz not null,
  status     public.loop_status not null default 'planning',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint loops_dates check (end_date >= start_date)
);
create index loops_track_idx on public.loops (track_id);

create table public.sessions (
  id              text primary key check (id ~ '^[a-z]{2,4}_[A-Za-z0-9]{4,40}$'),
  loop_id         text not null references public.loops (id) on delete cascade,
  code            text not null default '' check (char_length(code) <= 60),
  name            text not null default 'Untitled session' check (char_length(name) <= 200),
  summary         text not null default '' check (char_length(summary) <= 2000),
  type            public.session_type not null default 'recorded',
  status          public.publish_status not null default 'draft',
  sort_order      int not null default 0,
  instructor_id   text check (char_length(instructor_id) <= 64),
  scheduled_at    timestamptz,
  duration_min    int not null default 0 check (duration_min >= 0),
  meeting_url     text check (char_length(meeting_url) <= 2000),
  recording_ready boolean not null default false,
  content         jsonb not null default '{"titles": []}'::jsonb,
  rev             int not null default 1,
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint sessions_content_shape check (jsonb_typeof(content -> 'titles') = 'array'),
  constraint sessions_content_no_secrets check (
    not jsonb_path_exists(content, 'lax $.**.correct')
    and not jsonb_path_exists(content, 'lax $.**.modelAnswer')
  ),
  constraint sessions_content_size check (octet_length(content::text) < 2000000)
);
create index sessions_loop_order_idx on public.sessions (loop_id, sort_order);

-- { "<taskId>": { "correct": ["<optionId>", …], "modelAnswer": "…" } }
create table public.session_keys (
  session_id text primary key references public.sessions (id) on delete cascade,
  keys       jsonb not null default '{}'::jsonb check (jsonb_typeof(keys) = 'object'),
  updated_at timestamptz not null default now()
);

-- Storage paths a session's materials point at; filled by admin_save_session.
create table public.session_files (
  session_id text not null references public.sessions (id) on delete cascade,
  path       text not null,
  primary key (session_id, path)
);
create index session_files_path_idx on public.session_files (path);

create table public.enrollments (
  student_id  uuid not null references public.profiles (id) on delete cascade,
  loop_id     text not null references public.loops (id) on delete restrict,
  status      public.enrollment_status not null default 'active',
  enrolled_at timestamptz not null default now(),
  enrolled_by uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (student_id, loop_id)
);
create index enrollments_loop_idx on public.enrollments (loop_id);
create index enrollments_enrolled_by_idx on public.enrollments (enrolled_by);

-- ---------------------------------------------------------------- triggers

create trigger tracks_set_updated_at      before update on public.tracks       for each row execute function private.set_updated_at();
create trigger loops_set_updated_at       before update on public.loops        for each row execute function private.set_updated_at();
create trigger sessions_set_updated_at    before update on public.sessions     for each row execute function private.set_updated_at();
create trigger session_keys_set_updated_at before update on public.session_keys for each row execute function private.set_updated_at();
create trigger enrollments_set_updated_at before update on public.enrollments  for each row execute function private.set_updated_at();

create or replace function private.sessions_publish_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    new.published_at := now();
  end if;
  return new;
end
$$;
revoke all on function private.sessions_publish_stamp() from public;

create trigger sessions_publish_stamp
  before insert or update of status on public.sessions
  for each row execute function private.sessions_publish_stamp();

create or replace function private.enrollments_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = new.student_id and p.role = 'student') then
    raise exception 'only student accounts can be enrolled' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke all on function private.enrollments_guard() from public, anon, authenticated;

create trigger enrollments_guard
  before insert or update of student_id on public.enrollments
  for each row execute function private.enrollments_guard();

-- ---------------------------------------------------------------- access helpers

-- Courses the signed-in student is (or was) enrolled in.
create or replace function private.my_loop_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select e.loop_id
  from public.enrollments e
  join public.profiles p on p.id = e.student_id
  where e.student_id = (select auth.uid())
    and e.status <> 'dropped'
    and p.role = 'student'
    and not p.disabled
$$;
revoke all on function private.my_loop_ids() from public, anon;
grant execute on function private.my_loop_ids() to authenticated;

create or replace function private.my_track_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct l.track_id from public.loops l where l.id in (select private.my_loop_ids())
$$;
revoke all on function private.my_track_ids() from public, anon;
grant execute on function private.my_track_ids() to authenticated;

-- A live class is visible once published (its time is the class time, and
-- the meeting link must be reachable); a recorded session waits for its
-- release date when it has one.
create or replace function private.session_released(
  p_status public.publish_status, p_type public.session_type, p_scheduled_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'published'
     and (p_type = 'live' or p_scheduled_at is null or p_scheduled_at <= now())
$$;
revoke all on function private.session_released(public.publish_status, public.session_type, timestamptz) from public, anon;
grant execute on function private.session_released(public.publish_status, public.session_type, timestamptz) to authenticated;

create or replace function private.can_read_session(p_session_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin() or exists (
    select 1 from public.sessions s
    where s.id = p_session_id
      and s.loop_id in (select private.my_loop_ids())
      and private.session_released(s.status, s.type, s.scheduled_at)
  )
$$;
revoke all on function private.can_read_session(text) from public, anon;
grant execute on function private.can_read_session(text) to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.tracks        enable row level security;
alter table public.loops         enable row level security;
alter table public.sessions      enable row level security;
alter table public.session_keys  enable row level security;
alter table public.session_files enable row level security;
alter table public.enrollments   enable row level security;

revoke all on table public.tracks, public.loops, public.sessions,
  public.session_keys, public.session_files, public.enrollments from anon;

-- tracks
create policy tracks_select on public.tracks for select to authenticated
  using ((select private.is_admin()) or id in (select private.my_track_ids()));
create policy tracks_insert on public.tracks for insert to authenticated
  with check ((select private.is_admin()));
create policy tracks_update on public.tracks for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy tracks_delete on public.tracks for delete to authenticated
  using ((select private.is_admin()));

-- loops: a student sees every course of a program they are enrolled in (the
-- course list), but only the sessions of the courses they are enrolled in.
create policy loops_select on public.loops for select to authenticated
  using ((select private.is_admin()) or track_id in (select private.my_track_ids()));
create policy loops_insert on public.loops for insert to authenticated
  with check ((select private.is_admin()));
create policy loops_update on public.loops for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy loops_delete on public.loops for delete to authenticated
  using ((select private.is_admin()));

-- sessions
create policy sessions_select on public.sessions for select to authenticated
  using (
    (select private.is_admin())
    or (loop_id in (select private.my_loop_ids())
        and private.session_released(status, type, scheduled_at))
  );
create policy sessions_insert on public.sessions for insert to authenticated
  with check ((select private.is_admin()));
create policy sessions_update on public.sessions for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy sessions_delete on public.sessions for delete to authenticated
  using ((select private.is_admin()));

-- answer keys and file index: admin only
create policy session_keys_admin on public.session_keys for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy session_files_admin on public.session_files for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- enrollments
create policy enrollments_select on public.enrollments for select to authenticated
  using ((select private.is_admin()) or student_id = (select auth.uid()));
create policy enrollments_insert on public.enrollments for insert to authenticated
  with check ((select private.is_admin()));
create policy enrollments_update on public.enrollments for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy enrollments_delete on public.enrollments for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------- save RPC
-- One call saves a whole session: the row, its answer keys and its file
-- index, in one transaction. `rev` is an optimistic lock — a save based on a
-- stale copy (another tab) is refused with HTTP 409 instead of overwriting.
-- Security invoker: the admin RLS policies above still apply.

create or replace function public.admin_save_session(p_session jsonb, p_keys jsonb, p_base_rev int)
returns table (new_rev int, saved_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r     public.sessions;
  v_rev int;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  r := jsonb_populate_record(null::public.sessions, p_session);
  if r.id is null or r.loop_id is null then
    raise exception 'session id and loop_id are required' using errcode = '22023';
  end if;

  if p_base_rev is null then
    begin
      insert into public.sessions (
        id, loop_id, code, name, summary, type, status, sort_order, instructor_id,
        scheduled_at, duration_min, meeting_url, recording_ready, content, rev, created_at)
      values (
        r.id, r.loop_id, coalesce(r.code, ''), coalesce(r.name, 'Untitled session'),
        coalesce(r.summary, ''), coalesce(r.type, 'recorded'), coalesce(r.status, 'draft'),
        coalesce(r.sort_order, 0), r.instructor_id, r.scheduled_at, coalesce(r.duration_min, 0),
        r.meeting_url, coalesce(r.recording_ready, false),
        coalesce(r.content, '{"titles": []}'::jsonb), 1, coalesce(r.created_at, now()))
      returning public.sessions.rev into v_rev;
    exception when unique_violation then
      raise exception 'id_taken' using errcode = 'PT409';
    end;
  else
    update public.sessions s
       set loop_id         = r.loop_id,
           code            = coalesce(r.code, ''),
           name            = coalesce(r.name, 'Untitled session'),
           summary         = coalesce(r.summary, ''),
           type            = coalesce(r.type, 'recorded'),
           status          = coalesce(r.status, 'draft'),
           sort_order      = coalesce(r.sort_order, 0),
           instructor_id   = r.instructor_id,
           scheduled_at    = r.scheduled_at,
           duration_min    = coalesce(r.duration_min, 0),
           meeting_url     = r.meeting_url,
           recording_ready = coalesce(r.recording_ready, false),
           content         = coalesce(r.content, '{"titles": []}'::jsonb),
           rev             = s.rev + 1
     where s.id = r.id and s.rev = p_base_rev
    returning s.rev into v_rev;
    if v_rev is null then
      raise exception 'session_conflict' using errcode = 'PT409';
    end if;
  end if;

  insert into public.session_keys (session_id, keys)
  values (r.id, coalesce(p_keys, '{}'::jsonb))
  on conflict (session_id) do update set keys = excluded.keys;

  delete from public.session_files f where f.session_id = r.id;
  insert into public.session_files (session_id, path)
  select distinct r.id, substr(u #>> '{}', char_length('storage://materials/') + 1)
  from jsonb_path_query(coalesce(r.content, '{}'::jsonb), 'lax $.titles[*].materials[*].url') as u
  where jsonb_typeof(u) = 'string'
    and (u #>> '{}') like 'storage://materials/_%';

  return query select v_rev, now();
end
$$;
revoke all on function public.admin_save_session(jsonb, jsonb, int) from public, anon;
grant execute on function public.admin_save_session(jsonb, jsonb, int) to authenticated;
