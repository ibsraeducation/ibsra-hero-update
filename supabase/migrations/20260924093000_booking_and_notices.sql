-- ==========================================================================
-- When IBSRA teaches, when one student actually sits, and how everybody
-- hears about it.
--
-- The admin does not schedule a thousand dates. They say "Sunday and
-- Tuesday, 16:00-18:00" once, in their own time, and the server turns that
-- into real moments when a student is booked into it. Everything here is
-- authored in Africa/Cairo and stored as an absolute instant, so a family in
-- Toronto or Riyadh reads the same class at their own clock without anybody
-- converting anything by hand — Postgres carries the timezone database, so
-- Postgres does the conversion, DST included.
--
-- A toast is gone in 3.2 seconds and a family reads the app on their phone
-- that evening, so the third piece here is a row that stays: `notifications`.
-- ==========================================================================

-- ---------------------------------------------------------------- notices
-- Declared first: the booking side of answer_request (next migration) writes
-- into this table in the same transaction as the booking itself.
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind         text not null check (char_length(kind) <= 40),
  title        text not null check (char_length(title) between 1 and 160),
  body         text not null default '' check (char_length(body) <= 600),
  -- Where tapping it goes. An in-app path, never a URL.
  link         text not null default '' check (char_length(link) <= 300),
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists notifications_inbox_idx
  on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (recipient_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on table public.notifications from anon;

-- You read your own, and that is the whole of it. There is deliberately no
-- insert and no update policy: every row here is written by a security
-- definer function, so nobody can post themselves a notice, and nobody can
-- edit the wording of one they were sent.
create policy notifications_select on public.notifications
  for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_delete on public.notifications
  for delete to authenticated using (recipient_id = (select auth.uid()));

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  update public.notifications n
     set read_at = now()
   where n.recipient_id = (select auth.uid())
     and n.read_at is null
     and (p_ids is null or n.id = any(p_ids));
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- -------------------------------------------------------------- windows
create table if not exists public.availability_windows (
  id         uuid primary key default gen_random_uuid(),
  -- 0 = Sunday .. 6 = Saturday, matching extract(dow) and the Egyptian week.
  weekday    smallint not null check (weekday between 0 and 6),
  -- Minutes from midnight, Africa/Cairo. 16:00 is 960. Minutes, not a time,
  -- because a wall-clock `time` column invites someone to store it with a zone.
  start_min  int not null check (start_min >= 0 and start_min < 1440),
  end_min    int not null check (end_min   >  0 and end_min  <= 1440),
  constraint availability_windows_order check (end_min > start_min),
  -- What it is for. Both null = a window any program may be booked into.
  track_id   text references public.tracks (id) on delete cascade,
  loop_id    text references public.loops  (id) on delete cascade,
  -- Free text, like sessions.instructor_id: a mentor is not an account here.
  mentor     text not null default '' check (char_length(mentor) <= 120),
  capacity   int  not null default 1 check (capacity between 1 and 200),
  active     boolean not null default true,
  note       text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists availability_windows_track_idx
  on public.availability_windows (track_id, weekday) where active;

create table if not exists public.session_bookings (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles (id) on delete cascade,
  loop_id      text not null references public.loops (id) on delete cascade,
  -- The authored session this sitting covers, when there is one. A course
  -- booked before its sessions exist still gets its dates.
  session_id   text references public.sessions (id) on delete set null,
  window_id    uuid references public.availability_windows (id) on delete set null,
  -- The absolute moment. Cairo is where it was authored; this is when it is.
  starts_at    timestamptz not null,
  duration_min int not null default 120 check (duration_min > 0 and duration_min <= 600),
  status       text not null default 'booked'
               check (status in ('booked', 'done', 'cancelled')),
  request_id   uuid references public.access_requests (id) on delete set null,
  meeting_url  text check (char_length(meeting_url) <= 2000),
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists session_bookings_student_idx
  on public.session_bookings (student_id, starts_at);
create index if not exists session_bookings_when_idx
  on public.session_bookings (starts_at);
-- One student cannot sit in two places at once, and re-answering a request
-- must not double-book them.
create unique index if not exists session_bookings_one_per_slot_idx
  on public.session_bookings (student_id, starts_at)
  where status <> 'cancelled';

drop trigger if exists availability_windows_set_updated_at on public.availability_windows;
create trigger availability_windows_set_updated_at
  before update on public.availability_windows
  for each row execute function private.set_updated_at();
drop trigger if exists session_bookings_set_updated_at on public.session_bookings;
create trigger session_bookings_set_updated_at
  before update on public.session_bookings
  for each row execute function private.set_updated_at();

alter table public.availability_windows enable row level security;
alter table public.session_bookings     enable row level security;
revoke all on table public.availability_windows, public.session_bookings from anon;

-- A family choosing a time has to see the times on offer.
create policy availability_windows_select on public.availability_windows
  for select to authenticated using (active or (select private.is_admin()));
create policy availability_windows_write on public.availability_windows
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- Your own calendar, your child's calendar, or everybody's if you run the place.
create policy session_bookings_select on public.session_bookings
  for select to authenticated using (
    (select private.is_admin())
    or student_id = (select auth.uid())
    or student_id in (select private.my_children())
  );
create policy session_bookings_write on public.session_bookings
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ------------------------------------------------- a window, as real dates
-- Postgres owns the tz database, so it owns the conversion. `at time zone`
-- on a naive timestamp resolves Cairo's DST correctly for the day in
-- question — the thing that is painful to get right in a browser, and the
-- reason nothing upstream of this does it.
create or replace function private.expand_window(
  p_window uuid, p_from date, p_to date, p_limit int)
returns table (starts_at timestamptz, duration_min int)
language sql
stable
set search_path = ''
as $$
  select ((g.d + make_interval(mins => w.start_min)) at time zone 'Africa/Cairo'),
         (w.end_min - w.start_min)
    from public.availability_windows w
    -- Cast to plain timestamp: generate_series(date, date, interval) resolves
    -- to its timestamptz overload, which pins midnight to UTC before the
    -- Cairo arithmetic below ever runs — six hours wrong on this exact
    -- window in testing. A naive timestamp keeps the date a blank wall
    -- clock until `at time zone` gives it one, on purpose.
    cross join generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') g(d)
   where w.id = p_window
     and extract(dow from g.d) = w.weekday
   order by 1
   limit greatest(1, p_limit)
$$;
revoke all on function private.expand_window(uuid, date, date, int) from public, anon;

-- The next few dates of one window, so a family picking a time is shown
-- real days rather than "Sundays, at some point".
create or replace function public.window_occurrences(p_window uuid, p_count int default 6)
returns table (starts_at timestamptz, duration_min int)
language sql
stable
security definer
set search_path = ''
as $$
  select * from private.expand_window(
    p_window, current_date, (current_date + 120), greatest(1, least(coalesce(p_count, 6), 24)))
$$;
revoke all on function public.window_occurrences(uuid, int) from public, anon;
grant execute on function public.window_occurrences(uuid, int) to authenticated;

comment on table public.availability_windows is
  'Weekly recurring teaching windows, authored in Africa/Cairo — Sunday 16:00-18:00, not individual dates.';
comment on table public.session_bookings is
  'One student, in one window, at one real moment. Written by answer_request when the admin confirms a request.';
comment on table public.notifications is
  'A durable notice for one person — a bell, not a toast. Written only by security-definer functions.';
