-- learn, projects and outcomes now hold Markdown (nested bullets, headings),
-- so a whole pasted outline fits: 20000 characters each instead of 4000.

alter table public.tracks
  drop constraint tracks_learn_len,
  drop constraint tracks_projects_len,
  drop constraint tracks_outcomes_len;

alter table public.tracks
  add constraint tracks_learn_len check (char_length(learn) <= 20000),
  add constraint tracks_projects_len check (char_length(projects) <= 20000),
  add constraint tracks_outcomes_len check (char_length(outcomes) <= 20000);
