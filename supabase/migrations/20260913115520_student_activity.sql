-- ==========================================================================
-- What a student does: steps ticked off, and answers submitted.
--
-- Answers go in only through `submit_answer`, which grades multiple-choice on
-- the server against `session_keys` — the keys never reach the browser. A
-- multiple-choice question gets one try; written, link and file answers can be
-- resent until a mentor has graded them.
-- ==========================================================================

create type public.submission_status as enum ('submitted', 'graded');

create table public.step_progress (
  student_id uuid not null references public.profiles (id) on delete cascade,
  session_id text not null references public.sessions (id) on delete cascade,
  step_key   text not null check (step_key ~ '^[vmt]:[A-Za-z0-9_]{1,64}$'),
  done_at    timestamptz not null default now(),
  primary key (student_id, session_id, step_key)
);
create index step_progress_session_idx on public.step_progress (session_id);

create table public.submissions (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.profiles (id) on delete cascade,
  -- restrict: a session with student work is archived, not deleted
  session_id  text not null references public.sessions (id) on delete restrict,
  task_id     text not null check (char_length(task_id) <= 64),
  task_kind   text not null check (task_kind in ('mcq', 'multi', 'short', 'long', 'upload', 'link')),
  question    text not null default '',
  points      int  not null default 0,
  choice_ids  text[],
  answer_text text check (char_length(answer_text) <= 20000),
  link_url    text check (link_url ~* '^https?://' and char_length(link_url) <= 2000),
  file_path   text check (char_length(file_path) <= 500),
  is_correct  boolean,
  score       numeric(6, 2) check (score >= 0),
  auto_graded boolean not null default false,
  status      public.submission_status not null default 'submitted',
  feedback    text check (char_length(feedback) <= 5000),
  graded_by   uuid references public.profiles (id) on delete set null,
  graded_at   timestamptz,
  attempts    int not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, session_id, task_id)
);
create index submissions_session_idx on public.submissions (session_id);
create index submissions_graded_by_idx on public.submissions (graded_by);
create index submissions_status_idx on public.submissions (status);

create trigger submissions_set_updated_at
  before update on public.submissions
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- RLS

alter table public.step_progress enable row level security;
alter table public.submissions   enable row level security;

revoke all on table public.step_progress, public.submissions from anon;
revoke insert on table public.submissions from authenticated;

create policy step_progress_select on public.step_progress for select to authenticated
  using ((select private.is_admin()) or student_id = (select auth.uid()));
create policy step_progress_insert on public.step_progress for insert to authenticated
  with check (student_id = (select auth.uid()) and private.can_read_session(session_id));
create policy step_progress_delete on public.step_progress for delete to authenticated
  using (student_id = (select auth.uid()));

create policy submissions_select on public.submissions for select to authenticated
  using ((select private.is_admin()) or student_id = (select auth.uid()));
create policy submissions_update on public.submissions for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy submissions_delete on public.submissions for delete to authenticated
  using ((select private.is_admin()));

-- ---------------------------------------------------------------- RPCs

-- The shape a student gets back — never the answer key or the grading note.
create or replace function private.submission_result(r public.submissions)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', r.id, 'task_id', r.task_id, 'session_id', r.session_id, 'task_kind', r.task_kind,
    'status', r.status, 'is_correct', r.is_correct, 'score', r.score, 'points', r.points,
    'attempts', r.attempts, 'feedback', r.feedback, 'choice_ids', r.choice_ids,
    'answer_text', r.answer_text, 'link_url', r.link_url, 'file_path', r.file_path,
    'created_at', r.created_at, 'updated_at', r.updated_at)
$$;
revoke all on function private.submission_result(public.submissions) from public, anon, authenticated;

create or replace function public.submit_answer(
  p_session_id text,
  p_task_id    text,
  p_choice_ids text[] default null,
  p_text       text   default null,
  p_link       text   default null,
  p_file_path  text   default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_task       jsonb;
  v_kind       text;
  v_points     int;
  v_question   text;
  v_option_ids text[];
  v_correct    text[];
  v_is_correct boolean;
  v_row        public.submissions;
  v_exists     boolean;
begin
  if v_uid is null or not exists (
    select 1 from public.profiles p where p.id = v_uid and p.role = 'student' and not p.disabled
  ) then
    raise exception 'only students submit answers' using errcode = '42501';
  end if;

  if not private.can_read_session(p_session_id) then
    raise exception 'this session is not open to you' using errcode = '42501';
  end if;

  select jsonb_path_query_first(
           s.content, 'lax $.titles[*].tasks[*] ? (@.id == $t)', jsonb_build_object('t', p_task_id))
    into v_task
    from public.sessions s
   where s.id = p_session_id;
  if v_task is null then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  v_kind     := v_task ->> 'kind';
  v_points   := coalesce(nullif(v_task ->> 'points', '')::int, 0);
  v_question := left(coalesce(v_task ->> 'question', ''), 5000);

  select * into v_row
    from public.submissions sub
   where sub.student_id = v_uid and sub.session_id = p_session_id and sub.task_id = p_task_id;
  v_exists := found;

  if v_kind in ('mcq', 'multi') then
    if v_exists then
      return private.submission_result(v_row) || jsonb_build_object('already', true);
    end if;

    select coalesce(array_agg(o ->> 'id'), '{}')
      into v_option_ids
      from jsonb_array_elements(coalesce(v_task -> 'options', '[]'::jsonb)) as o;

    if p_choice_ids is null or cardinality(p_choice_ids) = 0 then
      raise exception 'choose an answer' using errcode = '22023';
    end if;
    if not (p_choice_ids <@ v_option_ids) then
      raise exception 'unknown option' using errcode = '22023';
    end if;
    if v_kind = 'mcq' and cardinality(p_choice_ids) <> 1 then
      raise exception 'choose exactly one answer' using errcode = '22023';
    end if;

    select coalesce(array_agg(x), '{}')
      into v_correct
      from public.session_keys k,
           jsonb_array_elements_text(coalesce(k.keys -> p_task_id -> 'correct', '[]'::jsonb)) as x
     where k.session_id = p_session_id;

    v_is_correct := cardinality(v_correct) > 0
      and (select array_agg(distinct c order by c) from unnest(p_choice_ids) as c)
          = (select array_agg(distinct c order by c) from unnest(v_correct) as c);

    insert into public.submissions (
      student_id, session_id, task_id, task_kind, question, points, choice_ids,
      is_correct, score, auto_graded, status, graded_at)
    values (
      v_uid, p_session_id, p_task_id, v_kind, v_question, v_points, p_choice_ids,
      v_is_correct, case when v_is_correct then v_points else 0 end, true, 'graded', now())
    returning * into v_row;

  else
    if v_exists and v_row.status = 'graded' then
      return private.submission_result(v_row) || jsonb_build_object('locked', true);
    end if;

    if v_kind in ('short', 'long') then
      if coalesce(btrim(p_text), '') = '' then
        raise exception 'write an answer first' using errcode = '22023';
      end if;
    elsif v_kind = 'link' then
      if p_link is null or p_link !~* '^https?://' then
        raise exception 'paste a full link starting with https://' using errcode = '22023';
      end if;
    elsif v_kind = 'upload' then
      if p_file_path is null or left(p_file_path, char_length(v_uid::text) + 1) <> v_uid::text || '/' then
        raise exception 'upload the file first' using errcode = '22023';
      end if;
    else
      raise exception 'unknown task kind' using errcode = '22023';
    end if;

    insert into public.submissions as sub (
      student_id, session_id, task_id, task_kind, question, points,
      answer_text, link_url, file_path, status)
    values (
      v_uid, p_session_id, p_task_id, v_kind, v_question, v_points,
      case when v_kind in ('short', 'long') then p_text end,
      case when v_kind = 'link' then p_link end,
      case when v_kind = 'upload' then p_file_path end,
      'submitted')
    on conflict (student_id, session_id, task_id) do update
       set answer_text = excluded.answer_text,
           link_url    = excluded.link_url,
           file_path   = excluded.file_path,
           question    = excluded.question,
           points      = excluded.points,
           attempts    = sub.attempts + 1,
           status      = 'submitted'
     where sub.status <> 'graded'
    returning * into v_row;

    if v_row.id is null then
      -- graded between the check and the write
      select * into v_row
        from public.submissions sub
       where sub.student_id = v_uid and sub.session_id = p_session_id and sub.task_id = p_task_id;
      return private.submission_result(v_row) || jsonb_build_object('locked', true);
    end if;
  end if;

  insert into public.step_progress (student_id, session_id, step_key)
  values (v_uid, p_session_id, 't:' || p_task_id)
  on conflict do nothing;

  return private.submission_result(v_row);
end
$$;
revoke all on function public.submit_answer(text, text, text[], text, text, text) from public, anon;
grant execute on function public.submit_answer(text, text, text[], text, text, text) to authenticated;

-- Published sessions in the student's courses that are not released yet:
-- names and dates only, so the course page can show them as "opens on …".
create or replace function public.student_upcoming_sessions()
returns table (
  id text, loop_id text, code text, name text, sort_order int,
  type public.session_type, scheduled_at timestamptz, duration_min int)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.loop_id, s.code, s.name, s.sort_order, s.type, s.scheduled_at, s.duration_min
  from public.sessions s
  where s.loop_id in (select private.my_loop_ids())
    and s.status = 'published'
    and not private.session_released(s.status, s.type, s.scheduled_at)
$$;
revoke all on function public.student_upcoming_sessions() from public, anon;
grant execute on function public.student_upcoming_sessions() to authenticated;
