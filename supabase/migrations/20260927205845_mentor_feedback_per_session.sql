/* A mentor's note can now be about one sitting, not only about the day.

   `session_id` null keeps the old meaning: a note about the hero in general.
   The uniqueness moves with it, so one day can carry a general note plus one
   note per sitting. */

alter table public.mentor_feedback
  add column if not exists session_id text
  references public.sessions (id) on delete restrict;

comment on column public.mentor_feedback.session_id is
  'The sitting this note is about. Null is a note about the hero in general.';

alter table public.mentor_feedback
  drop constraint if exists mentor_feedback_student_id_day_key;

create unique index if not exists mentor_feedback_one_per_day_idx
  on public.mentor_feedback (student_id, day, coalesce(session_id, ''));

create index if not exists mentor_feedback_session_idx
  on public.mentor_feedback (session_id) where session_id is not null;
