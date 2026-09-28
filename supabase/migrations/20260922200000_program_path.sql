-- ==========================================================================
-- The training path, saved.
--
-- Which column a program sits in on the map, and every line the admin drew
-- between programs, lived only in the browser until now: a reload read them
-- back as nothing, so every program fell into "Specializations" and adding
-- one straight into a column never stuck. Both belong to the program.
--
--   stage     null means "work it out from the lines" — the normal answer.
--   next_ids  the programs this one leads to. Ids only; a program that is
--             deleted is simply skipped when the path is read, so there is
--             no cleanup to get wrong.
-- ==========================================================================

alter table public.tracks
  add column if not exists stage text
  check (stage is null or stage in ('foundation', 'specialization', 'capstone'));

comment on column public.tracks.stage is
  'null = read the column off the connections (see stageOf in lib/programs).';

alter table public.tracks
  add column if not exists next_ids jsonb not null default '[]'::jsonb
  check (
    jsonb_typeof(next_ids) = 'array'
    and jsonb_array_length(next_ids) <= 60
    and not jsonb_path_exists(next_ids, '$[*] ? (!(@.type() == "string"))')
  );

comment on column public.tracks.next_ids is
  'The programs this one leads to — the path, as the admin drew it on the map.';
