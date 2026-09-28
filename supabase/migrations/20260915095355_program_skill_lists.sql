-- Each kind of skill is written like the values: Markdown with bullets and
-- sub-bullets. `skills` stays, filled by the app on save with every point of
-- these lists as {name, category}, so the skills can still be queried.

alter table public.tracks
  add column technical_skills text not null default ''
    constraint tracks_technical_skills_len check (char_length(technical_skills) <= 20000),
  add column marketing_skills text not null default ''
    constraint tracks_marketing_skills_len check (char_length(marketing_skills) <= 20000),
  add column personal_skills text not null default ''
    constraint tracks_personal_skills_len check (char_length(personal_skills) <= 20000);
