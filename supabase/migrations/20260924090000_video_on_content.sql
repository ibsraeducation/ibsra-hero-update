-- ==========================================================================
-- One video link on a program, a course and a session.
--
-- Not a VideoAsset: a marketplace video is a link the admin pastes — YouTube
-- (unlisted), Vimeo or Drive, the same providers a topic's teaching
-- recording already uses (see src/roles/student/media.ts embedUrl) — with no
-- checkpoints, no transcoding state and no answer keys hanging off it. It is
-- shown to a family before they enrol, so it has to be the simplest thing
-- that could carry one.
-- ==========================================================================

alter table public.tracks
  add column if not exists video_url text
  check (video_url is null or char_length(video_url) <= 2000);

alter table public.loops
  add column if not exists video_url text
  check (video_url is null or char_length(video_url) <= 2000);

alter table public.sessions
  add column if not exists video_url text
  check (video_url is null or char_length(video_url) <= 2000);

comment on column public.tracks.video_url is
  'The program''s introduction video, shown in the Marketplace before anybody enrols.';
comment on column public.loops.video_url is
  'The course''s own video, shown next to what it covers.';
comment on column public.sessions.video_url is
  'A preview of this session, shown in the Marketplace outline — separate from the teaching recordings on its topics.';

-- A session is saved through this function, not by upsert (see
-- 20260923090000_values_on_courses_and_sessions.sql, which this supersedes),
-- so video_url has to be carried across here too or the field would save
-- nothing.
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
        technical_skills, marketing_skills, personal_skills, skills, video_url)
      values (
        r.id, r.loop_id, coalesce(r.code, ''), coalesce(r.name, 'Untitled session'),
        coalesce(r.summary, ''), coalesce(r.type, 'recorded'), coalesce(r.status, 'draft'),
        coalesce(r.sort_order, 0), r.instructor_id, r.scheduled_at, coalesce(r.duration_min, 0),
        r.meeting_url, coalesce(r.recording_ready, false),
        coalesce(r.content, '{"titles": []}'::jsonb), 1, coalesce(r.created_at, now()),
        coalesce(r.technical_values, ''), coalesce(r.personal_values, ''),
        coalesce(r.market_values, ''), coalesce(r.asset_value, ''),
        coalesce(r.technical_skills, ''), coalesce(r.marketing_skills, ''),
        coalesce(r.personal_skills, ''), coalesce(r.skills, '[]'::jsonb), r.video_url)
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
           video_url        = r.video_url,
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
