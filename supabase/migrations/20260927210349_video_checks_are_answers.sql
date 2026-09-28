/* A question the video stops for is worth marks like any other, and the
   answer is kept. `imagetext` is added at the same time: it has been
   authorable in the editor all along while the check refused it. */

alter table public.submissions
  drop constraint if exists submissions_task_kind_check;

alter table public.submissions
  add constraint submissions_task_kind_check check (
    task_kind = any (array['mcq', 'multi', 'short', 'long', 'upload', 'link', 'imagetext', 'check'])
  );

create or replace function public.submit_answer(
  p_session_id text,
  p_task_id text,
  p_choice_ids text[] default null,
  p_text text default null,
  p_link text default null,
  p_file_path text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid        uuid := (select auth.uid());
  v_task       jsonb;
  v_kind       text;
  v_shape      text;
  v_is_check   boolean := false;
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
    select jsonb_path_query_first(
             s.content, 'lax $.titles[*].video.checks[*] ? (@.id == $t)', jsonb_build_object('t', p_task_id))
      into v_task
      from public.sessions s
     where s.id = p_session_id;
    v_is_check := v_task is not null;
  end if;

  if v_task is null then
    raise exception 'task not found' using errcode = 'P0002';
  end if;

  v_shape    := v_task ->> 'kind';
  v_kind     := case when v_is_check then 'check' else v_shape end;
  v_points   := coalesce(nullif(v_task ->> 'points', '')::int, 0);
  v_question := left(coalesce(v_task ->> 'question', ''), 5000);

  select * into v_row
    from public.submissions sub
   where sub.student_id = v_uid and sub.session_id = p_session_id and sub.task_id = p_task_id;
  v_exists := found;

  if v_shape in ('mcq', 'multi') then
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
    if v_shape = 'mcq' and cardinality(p_choice_ids) <> 1 then
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

    if v_shape in ('short', 'long', 'imagetext', 'technical') then
      if coalesce(btrim(p_text), '') = '' then
        raise exception 'write an answer first' using errcode = '22023';
      end if;
      if p_file_path is not null
         and left(p_file_path, char_length(v_uid::text) + 1) <> v_uid::text || '/' then
        raise exception 'upload the file first' using errcode = '22023';
      end if;
    elsif v_shape = 'link' then
      if p_link is null or p_link !~* '^https?://' then
        raise exception 'paste a full link starting with https://' using errcode = '22023';
      end if;
    elsif v_shape = 'upload' then
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
      case when v_shape in ('short', 'long', 'imagetext', 'technical') then p_text end,
      case when v_shape = 'link' then p_link end,
      case when v_shape in ('upload', 'imagetext', 'technical') then p_file_path end,
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
      select * into v_row
        from public.submissions sub
       where sub.student_id = v_uid and sub.session_id = p_session_id and sub.task_id = p_task_id;
      return private.submission_result(v_row) || jsonb_build_object('locked', true);
    end if;
  end if;

  /* A checkpoint is not a step in the flow, so it never ticks one off. */
  if not v_is_check then
    insert into public.step_progress (student_id, session_id, step_key)
    values (v_uid, p_session_id, 't:' || p_task_id)
    on conflict do nothing;
  end if;

  return private.submission_result(v_row);
end
$function$;
