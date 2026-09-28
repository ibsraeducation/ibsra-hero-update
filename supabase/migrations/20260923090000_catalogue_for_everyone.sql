-- ==========================================================================
-- The catalogue is readable by anyone signed in.
--
-- Material shows the same picture to all three: the admin draws the path,
-- and the student and their family read it. A student could only see the
-- programs they were already enrolled in, so their map had one column and
-- the line under it — "the greyed programs are not yours yet" — promised
-- something they were never sent.
--
-- Programs and courses are the catalogue: names, what they teach, what they
-- cost. A student already meets all of it in the MarketPlace. The content
-- itself does not move: `sessions`, `session_keys` and `session_files` keep
-- the policies they have, so what a student can OPEN is unchanged.
-- ==========================================================================

drop policy if exists tracks_select on public.tracks;
create policy tracks_select on public.tracks
  for select to authenticated
  using (true);

drop policy if exists loops_select on public.loops;
create policy loops_select on public.loops
  for select to authenticated
  using (true);
