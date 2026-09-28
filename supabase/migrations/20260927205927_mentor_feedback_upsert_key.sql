/* The uniqueness written a moment ago was an expression index, which an
   upsert from the client cannot name — PostgREST's on_conflict takes a
   column list. `nulls not distinct` says the same thing in columns: one
   general note per hero per day, and one note per sitting beside it. */

drop index if exists public.mentor_feedback_one_per_day_idx;

create unique index if not exists mentor_feedback_one_per_day_idx
  on public.mentor_feedback (student_id, day, session_id) nulls not distinct;
