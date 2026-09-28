-- ==========================================================================
-- Restore the paid-subscription check on answer_request.
--
-- A concurrent change (availability windows, calendar bookings, in-app
-- notifications) replaced this function and dropped the check added in
-- 20260924100000_one_door_wallet.sql: a course must never open for a
-- student with no live subscription. This reapplies it — one guard, added
-- back at the top of the approve branch — and changes nothing else: the
-- booking and notification logic that landed since is untouched.
-- ==========================================================================

create or replace function public.answer_request(
  p_id      uuid,
  p_approve boolean,
  p_loops   text[] default null,
  p_note    text default null,
  p_window  uuid default null
)
returns public.access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req    public.access_requests;
  v_win    public.availability_windows;
  v_admin  uuid := (select auth.uid());
  v_n      integer := 0;
  v_booked integer := 0;
  v_kid    text;
  v_prog   text;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_req from public.access_requests r where r.id = p_id for update;
  if v_req.id is null then
    raise exception 'that request is gone' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'that request was answered already' using errcode = '23505';
  end if;

  if p_approve then
    if not exists (
      select 1 from public.subscriptions s
       where s.student_id = v_req.student_id
         and s.paid_through >= current_date
    ) then
      raise exception 'that student has no live subscription — the family pays the months first'
        using errcode = '22023';
    end if;

    insert into public.enrollments (student_id, loop_id, status, enrolled_by)
    select v_req.student_id, l.id, 'active', v_admin
      from public.loops l
     where l.id = any(coalesce(p_loops, array[]::text[]))
       and (
         (v_req.loop_id is not null and l.id = v_req.loop_id)
         or (v_req.track_id is not null and l.track_id = v_req.track_id)
       )
    on conflict (student_id, loop_id) do update set status = 'active';
    get diagnostics v_n = row_count;

    if v_n = 0 then
      raise exception 'tick at least one course to open' using errcode = '22023';
    end if;

    select * into v_win from public.availability_windows w
     where w.id = coalesce(p_window, v_req.window_id) and w.active;

    if v_win.id is not null then
      insert into public.session_bookings (
        student_id, loop_id, window_id, starts_at, duration_min, request_id, created_by)
      select v_req.student_id, l.id, v_win.id, x.starts_at, x.duration_min, v_req.id, v_admin
        from public.loops l
        cross join lateral private.expand_window(
          v_win.id,
          greatest(current_date, l.start_date::date),
          least(l.end_date::date, current_date + 365),
          52) x
       where l.id = any(coalesce(p_loops, array[]::text[]))
      on conflict do nothing;
      get diagnostics v_booked = row_count;
    end if;
  end if;

  update public.access_requests r
     set status      = (case when p_approve then 'approved' else 'declined' end)::public.request_status,
         answer_note = left(coalesce(p_note, ''), 600),
         window_id   = coalesce(p_window, r.window_id),
         answered_by = v_admin,
         answered_at = now()
   where r.id = p_id
  returning * into v_req;

  select coalesce(p.name, 'your hero') into v_kid from public.profiles p where p.id = v_req.student_id;
  select coalesce(t.name, 'the program') into v_prog from public.tracks t where t.id = v_req.track_id;

  if p_approve then
    insert into public.notifications (recipient_id, kind, title, body, link) values
      (v_req.parent_id,  'request_approved',
       v_prog || ' is open for ' || v_kid,
       case when v_booked > 0
            then v_booked || ' sessions are on the calendar. ' || coalesce(v_req.answer_note, '')
            else coalesce(v_req.answer_note, '') end,
       '/parent/calendar'),
      (v_req.student_id, 'request_approved',
       v_prog || ' is open',
       case when v_booked > 0 then 'Your session times are on your calendar.' else '' end,
       '/student/calendar'),
      (v_admin, 'booking_made',
       'Booked ' || v_kid || ' into ' || v_prog,
       v_n || ' courses opened, ' || v_booked || ' sittings scheduled.',
       '/admin/calendar');
  else
    insert into public.notifications (recipient_id, kind, title, body, link)
    values (v_req.parent_id, 'request_declined',
            'Not this time -- ' || v_prog,
            coalesce(v_req.answer_note, ''), '/parent/marketplace');
  end if;

  return v_req;
end
$$;
revoke all on function public.answer_request(uuid, boolean, text[], text, uuid) from public, anon;
grant execute on function public.answer_request(uuid, boolean, text[], text, uuid) to authenticated;
