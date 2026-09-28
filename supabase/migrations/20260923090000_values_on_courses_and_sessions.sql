-- ==========================================================================
-- The same seven lists on a course and on a session that a program has.
--
-- A program describes itself in seven Markdown lists — its technical,
-- personal, market and asset value, and the technical, marketing and
-- personal skills it builds — with `skills` filled from the last three on
-- save. Courses and sessions had nothing of the kind on the server: the
-- course form had grown a "what this course covers" box, but `loops` never
-- got a column for it, so every outline typed there was dropped on sync.
-- That is fixed here too, and the box keeps its text from now on.
--
-- Same names, same caps, same defaults as on `tracks`, so one mapper
-- serves all three.
-- ==========================================================================

alter table public.loops
  add column if not exists overview         text  not null default '' check (char_length(overview) <= 20000),
  add column if not exists technical_values text  not null default '' check (char_length(technical_values) <= 20000),
  add column if not exists personal_values  text  not null default '' check (char_length(personal_values) <= 20000),
  add column if not exists market_values    text  not null default '' check (char_length(market_values) <= 20000),
  add column if not exists asset_value      text  not null default '' check (char_length(asset_value) <= 20000),
  add column if not exists technical_skills text  not null default '' check (char_length(technical_skills) <= 20000),
  add column if not exists marketing_skills text  not null default '' check (char_length(marketing_skills) <= 20000),
  add column if not exists personal_skills  text  not null default '' check (char_length(personal_skills) <= 20000),
  add column if not exists skills           jsonb not null default '[]'::jsonb;

alter table public.sessions
  add column if not exists technical_values text  not null default '' check (char_length(technical_values) <= 20000),
  add column if not exists personal_values  text  not null default '' check (char_length(personal_values) <= 20000),
  add column if not exists market_values    text  not null default '' check (char_length(market_values) <= 20000),
  add column if not exists asset_value      text  not null default '' check (char_length(asset_value) <= 20000),
  add column if not exists technical_skills text  not null default '' check (char_length(technical_skills) <= 20000),
  add column if not exists marketing_skills text  not null default '' check (char_length(marketing_skills) <= 20000),
  add column if not exists personal_skills  text  not null default '' check (char_length(personal_skills) <= 20000),
  add column if not exists skills           jsonb not null default '[]'::jsonb;

-- A session is saved through this function, not by upsert, so the new
-- columns have to be carried across here or the form would save nothing.
create or replace function public.admin_save_session(p_session jsonb, p_keys jsonb, p_base_rev integer)
returns table(new_rev integer, saved_at timestamptz)
language plpgsql
set search_path to ''
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
        scheduled_at, duration_min, meeting_url, recording_ready, content, rev, created_at,
        technical_values, personal_values, market_values, asset_value,
        technical_skills, marketing_skills, personal_skills, skills)
      values (
        r.id, r.loop_id, coalesce(r.code, ''), coalesce(r.name, 'Untitled session'),
        coalesce(r.summary, ''), coalesce(r.type, 'recorded'), coalesce(r.status, 'draft'),
        coalesce(r.sort_order, 0), r.instructor_id, r.scheduled_at, coalesce(r.duration_min, 0),
        r.meeting_url, coalesce(r.recording_ready, false),
        coalesce(r.content, '{"titles": []}'::jsonb), 1, coalesce(r.created_at, now()),
        coalesce(r.technical_values, ''), coalesce(r.personal_values, ''),
        coalesce(r.market_values, ''), coalesce(r.asset_value, ''),
        coalesce(r.technical_skills, ''), coalesce(r.marketing_skills, ''),
        coalesce(r.personal_skills, ''), coalesce(r.skills, '[]'::jsonb))
      returning public.sessions.rev into v_rev;
    exception when unique_violation then
      raise exception 'id_taken' using errcode = 'PT409';
    end;
  else
    update public.sessions s
       set loop_id          = r.loop_id,
           code             = coalesce(r.code, ''),
           name             = coalesce(r.name, 'Untitled session'),
           summary          = coalesce(r.summary, ''),
           type             = coalesce(r.type, 'recorded'),
           status           = coalesce(r.status, 'draft'),
           sort_order       = coalesce(r.sort_order, 0),
           instructor_id    = r.instructor_id,
           scheduled_at     = r.scheduled_at,
           duration_min     = coalesce(r.duration_min, 0),
           meeting_url      = r.meeting_url,
           recording_ready  = coalesce(r.recording_ready, false),
           content          = coalesce(r.content, '{"titles": []}'::jsonb),
           technical_values = coalesce(r.technical_values, ''),
           personal_values  = coalesce(r.personal_values, ''),
           market_values    = coalesce(r.market_values, ''),
           asset_value      = coalesce(r.asset_value, ''),
           technical_skills = coalesce(r.technical_skills, ''),
           marketing_skills = coalesce(r.marketing_skills, ''),
           personal_skills  = coalesce(r.personal_skills, ''),
           skills           = coalesce(r.skills, '[]'::jsonb),
           rev              = s.rev + 1
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
