-- A program is described by what the student learns and the skills they gain,
-- each skill in one category. Skill, tier, colour and description are gone.

alter table public.tracks
  drop column skill,
  drop column tier,
  drop column color,
  drop column blurb;

drop type public.track_tier;

alter table public.tracks
  add column learn text not null default ''
    constraint tracks_learn_len check (char_length(learn) <= 4000),
  add column skills jsonb not null default '[]'::jsonb
    constraint tracks_skills_shape check (
      jsonb_typeof(skills) = 'array'
      and jsonb_array_length(skills) <= 60
      and octet_length(skills::text) <= 16000
      and not jsonb_path_exists(skills,
        '$[*] ? (!(@.name.type() == "string")
                 || !(@.category == "technical" || @.category == "marketing" || @.category == "personal"))')
    );
