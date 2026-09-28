/* Attendance, recorded rather than guessed.

   `joined_at` is the hero's own claim — the moment they asked for the link.
   `attended` is the record, and only an admin writes it. */

alter table public.session_bookings
  add column if not exists joined_at timestamptz,
  add column if not exists attended boolean,
  add column if not exists confirmed_by uuid references public.profiles (id) on delete set null,
  add column if not exists confirmed_at timestamptz;

create index if not exists session_bookings_unconfirmed_idx
  on public.session_bookings (ends_at desc) where attended is null;

/* ---------------- the hero asks for the link ---------------- */

create or replace function public.join_booking(p_booking uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_row public.session_bookings;
begin
  if v_uid is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select * into v_row from public.session_bookings b where b.id = p_booking;
  if not found then
    raise exception 'sitting not found' using errcode = 'P0002';
  end if;

  if not (
    v_row.student_id = v_uid
    or exists (
      select 1 from public.guardians g
       where g.student_id = v_row.student_id and g.parent_id = v_uid
    )
    or private.is_admin()
  ) then
    raise exception 'this sitting is not yours' using errcode = '42501';
  end if;

  if v_row.status = 'cancelled' then
    raise exception 'this sitting was cancelled' using errcode = '22023';
  end if;

  if now() < v_row.starts_at - interval '15 minutes' then
    raise exception 'too early — the link opens fifteen minutes before' using errcode = '22023';
  end if;
  if now() > v_row.ends_at + interval '15 minutes' then
    raise exception 'this sitting is over' using errcode = '22023';
  end if;

  if coalesce(v_row.meeting_url, '') = '' then
    raise exception 'no meeting link on this sitting yet' using errcode = '22023';
  end if;

  update public.session_bookings
     set joined_at = coalesce(joined_at, now()), updated_at = now()
   where id = p_booking;

  return v_row.meeting_url;
end
$function$;

/* ---------------- the admin says who was there ---------------- */

create or replace function public.confirm_attendance(p_booking uuid, p_attended boolean)
returns public.session_bookings
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_row public.session_bookings;
begin
  if not private.is_admin() then
    raise exception 'only an admin confirms attendance' using errcode = '42501';
  end if;

  update public.session_bookings
     set attended     = p_attended,
         confirmed_by = (select auth.uid()),
         confirmed_at = now(),
         status       = case when status = 'booked' then 'done' else status end,
         updated_at   = now()
   where id = p_booking
  returning * into v_row;

  if not found then
    raise exception 'sitting not found' using errcode = 'P0002';
  end if;

  return v_row;
end
$function$;

revoke execute on function public.join_booking(uuid) from public, anon;
revoke execute on function public.confirm_attendance(uuid, boolean) from public, anon;
grant execute on function public.join_booking(uuid) to authenticated;
grant execute on function public.confirm_attendance(uuid, boolean) to authenticated;
