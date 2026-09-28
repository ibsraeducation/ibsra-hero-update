-- ==========================================================================
-- What a parent is allowed to see of their own child.
--
-- Until now a parent could read the catalogue and nothing else: the material
-- and the work belonged to the student. That leaves a family paying for a
-- program they cannot look at, and asking the mentor by phone how it is
-- going. Three reads open up, all of them read-only and all of them scoped
-- to a child on their own account:
--
--   sessions        the same sessions their child can open, and no answer key
--   step_progress   what the child ticked off — the parent's Material page
--   submissions     what they handed in and what it scored — the feedback page
--
-- And one new table: the mentor's note about a child, written by the admin,
-- in words and in voice. It is what the family reads on the feedback page.
-- ==========================================================================

-- --------------------------------------------- the courses of my children

create or replace function private.my_children_loop_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct e.loop_id
  from public.enrollments e
  where e.student_id in (select private.my_children())
    and e.status <> 'dropped'
$$;
revoke all on function private.my_children_loop_ids() from public, anon;
grant execute on function private.my_children_loop_ids() to authenticated;

-- --------------------------------------------------------- the material

drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
  using (
    (select private.is_admin())
    or (loop_id in (select private.my_loop_ids())
        and private.session_released(status, type, scheduled_at))
    or (loop_id in (select private.my_children_loop_ids())
        and private.session_released(status, type, scheduled_at))
  );

-- ------------------------------------------------------- what they did

drop policy if exists step_progress_select on public.step_progress;
create policy step_progress_select on public.step_progress for select to authenticated
  using (
    (select private.is_admin())
    or student_id = (select auth.uid())
    or student_id in (select private.my_children())
  );

drop policy if exists submissions_select on public.submissions;
create policy submissions_select on public.submissions for select to authenticated
  using (
    (select private.is_admin())
    or student_id = (select auth.uid())
    or student_id in (select private.my_children())
  );

-- --------------------------------------------- what the mentor says of it

-- One note per child per day: what happened, what to work on next, and the
-- voice clip if the mentor recorded one rather than typing it.
create table public.mentor_feedback (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  -- The program it is about, when it is about one. Kept loose on purpose:
  -- a note outlives the program it was written under.
  track_id   text references public.tracks (id) on delete set null,
  -- Local day the mentor wrote it, so a family reads "today" and means it.
  day        date not null default current_date,
  body       text not null default '' check (char_length(body) <= 4000),
  focus      text not null default '' check (char_length(focus) <= 300),
  -- Path in the private `mentor-voice` bucket. null means it was typed.
  voice_path text check (char_length(voice_path) <= 500),
  voice_sec  integer check (voice_sec is null or (voice_sec > 0 and voice_sec <= 1800)),
  author_id  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Writing again on the same day replaces that day's note.
  unique (student_id, day)
);
create index mentor_feedback_student_idx on public.mentor_feedback (student_id, day desc);
create index mentor_feedback_author_idx on public.mentor_feedback (author_id);

create trigger mentor_feedback_set_updated_at
  before update on public.mentor_feedback
  for each row execute function private.set_updated_at();

alter table public.mentor_feedback enable row level security;
revoke all on table public.mentor_feedback from anon;

-- The child reads their own, the family reads their children's, the admin
-- writes them. Nobody else sees a word.
create policy mentor_feedback_select on public.mentor_feedback for select to authenticated
  using (
    (select private.is_admin())
    or student_id = (select auth.uid())
    or student_id in (select private.my_children())
  );
create policy mentor_feedback_insert on public.mentor_feedback for insert to authenticated
  with check ((select private.is_admin()));
create policy mentor_feedback_update on public.mentor_feedback for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy mentor_feedback_delete on public.mentor_feedback for delete to authenticated
  using ((select private.is_admin()));

-- ------------------------------------------------------------ the voice
-- <student uuid>/<day>-<uuid>.webm — private, like the payment proofs: the
-- admin who recorded it, the child it is about, and their parents.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mentor-voice', 'mentor-voice', false, 26214400,
        array['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav'])
on conflict (id) do nothing;

create policy "ibsra mentor voice read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mentor-voice'
    and (
      (select private.is_admin())
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from private.my_children() k
        where k::text = (storage.foldername(name))[1]
      )
    )
  );

create policy "ibsra mentor voice write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mentor-voice' and (select private.is_admin()));

create policy "ibsra mentor voice replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'mentor-voice' and (select private.is_admin()))
  with check (bucket_id = 'mentor-voice' and (select private.is_admin()));

create policy "ibsra mentor voice delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'mentor-voice' and (select private.is_admin()));
