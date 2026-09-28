-- ==========================================================================
-- A family asks; the admin decides what opens.
--
-- Nothing in the curriculum is sold any more. The platform is paid for by
-- the month, and what a student may open is not something a parent buys —
-- it is something the admin grants, in the order the courses are meant to be
-- taken. So the Marketplace stops being a till and becomes a catalogue with
-- one button on it: request this for my hero.
--
--   access_requests   one ask: this hero, this program (or one course of it)
--   answer_request()  the admin's reply, and the enrolments it writes
--
-- A request names either a program or a single course. Answering it is where
-- the sequence is decided: the admin ticks the courses that student is ready
-- for now, and the rest stay shut until they ask again — or until the admin
-- opens them from Students.
-- ==========================================================================

create type public.request_status as enum ('pending', 'approved', 'declined');

create table public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  -- Who asked, and who it is for. The parent is kept even after an answer:
  -- it is their request, and they read the reply on their own page.
  parent_id   uuid not null references public.profiles (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  -- What was asked for. A program, or one course of it — never neither.
  track_id    text references public.tracks (id) on delete cascade,
  loop_id     text references public.loops (id) on delete cascade,
  constraint access_requests_wants_something
    check (track_id is not null or loop_id is not null),
  -- What the family wrote with it, and what the admin wrote back.
  note        text not null default '' check (char_length(note) <= 600),
  status      public.request_status not null default 'pending',
  answer_note text not null default '' check (char_length(answer_note) <= 600),
  answered_by uuid references public.profiles (id) on delete set null,
  answered_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index access_requests_open_idx on public.access_requests (status, created_at desc);
create index access_requests_parent_idx on public.access_requests (parent_id, created_at desc);
create index access_requests_student_idx on public.access_requests (student_id);

-- The same ask, twice, while the first one is still waiting is not a second
-- ask — it is a family wondering whether the first one arrived.
create unique index access_requests_one_open_idx
  on public.access_requests (student_id, coalesce(track_id, ''), coalesce(loop_id, ''))
  where status = 'pending';

create trigger access_requests_set_updated_at
  before update on public.access_requests
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------------ RLS

alter table public.access_requests enable row level security;
revoke all on table public.access_requests from anon;

-- A family reads its own asks and the answers on them; the admin reads all.
create policy access_requests_select on public.access_requests for select to authenticated
  using ((select private.is_admin()) or parent_id = (select auth.uid()));

-- A family may only ask for a hero on their own account, and only ever for
-- something still waiting: the answer is the admin's to write.
create policy access_requests_insert on public.access_requests for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and (select private.is_parent())
    and student_id in (select private.my_children())
    and status = 'pending'
    and answered_by is null
    and answered_at is null
  );

-- Taking back an ask nobody has answered yet.
create policy access_requests_delete on public.access_requests for delete to authenticated
  using (
    (select private.is_admin())
    or (parent_id = (select auth.uid()) and status = 'pending')
  );

create policy access_requests_update on public.access_requests for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ------------------------------------------------------- answering one
-- Approving is the enrolment: the courses the admin ticked open in the same
-- transaction that stamps the request, so a family is never told yes by a
-- screen that failed to open anything.

create or replace function public.answer_request(
  p_id      uuid,
  p_approve boolean,
  p_loops   text[] default null,
  p_note    text default null
)
returns public.access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req   public.access_requests;
  v_admin uuid := (select auth.uid());
  v_n     integer := 0;
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
    -- Only courses that belong to what was actually asked for. A request for
    -- one course can open that course; a request for a program can open any
    -- course of that program, in whatever order the admin judges right.
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
  end if;

  update public.access_requests r
     set status      = case when p_approve then 'approved' else 'declined' end,
         answer_note = left(coalesce(p_note, ''), 600),
         answered_by = v_admin,
         answered_at = now()
   where r.id = p_id
  returning * into v_req;

  return v_req;
end
$$;
revoke all on function public.answer_request(uuid, boolean, text[], text) from public, anon;
grant execute on function public.answer_request(uuid, boolean, text[], text) to authenticated;

comment on table public.access_requests is
  'A family asking for a program, or one course of it, for one of their heroes. Nothing is bought: the admin decides what opens and when.';
