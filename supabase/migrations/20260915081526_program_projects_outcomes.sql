-- Beside what the student learns, a program lists the projects they will be
-- able to build and its technical outcomes. Both are one point per line, like learn.

alter table public.tracks
  add column projects text not null default ''
    constraint tracks_projects_len check (char_length(projects) <= 4000),
  add column outcomes text not null default ''
    constraint tracks_outcomes_len check (char_length(outcomes) <= 4000);
