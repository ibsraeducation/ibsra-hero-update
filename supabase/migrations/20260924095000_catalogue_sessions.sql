-- ==========================================================================
-- What a session looks like from the shop window.
--
-- Tracks and loops are readable by anyone signed in (see
-- 20260923090000_catalogue_for_everyone.sql), but sessions were left alone
-- on purpose: a non-enrolled viewer must read zero session rows, because a
-- session carries `content` (every material and task) and `meeting_url`.
--
-- A family shopping for a program still has to see what is inside it — the
-- session names, their length and the admin's preview video — so this is
-- the projection that shows exactly that and nothing else. Security definer
-- because the whole point is to see past the enrolment gate; the narrow
-- column list is the safety, not the policy.
-- ==========================================================================

create or replace function public.catalogue_sessions()
returns table (
  id text, loop_id text, name text, summary text,
  type public.session_type, sort_order int, duration_min int, video_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.loop_id, s.name, s.summary, s.type, s.sort_order,
         s.duration_min, s.video_url
    from public.sessions s
    join public.loops  l on l.id = s.loop_id
    join public.tracks t on t.id = l.track_id
   where s.status = 'published'
     and coalesce(t.listed, true)
     and coalesce(t.area, 'material') <> 'work'
$$;
revoke all on function public.catalogue_sessions() from public, anon;
grant execute on function public.catalogue_sessions() to authenticated;
