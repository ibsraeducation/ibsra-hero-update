-- A program's lists are now four values, each Markdown: technical, personal,
-- market and asset. They replace learn, projects and outcomes, which held no
-- data yet; the guard stops the migration if that is no longer true.

do $$
begin
  if exists (select 1 from public.tracks where learn <> '' or projects <> '' or outcomes <> '') then
    raise exception 'tracks already hold learn/projects/outcomes text; move it into the value columns first';
  end if;
end $$;

alter table public.tracks
  drop column learn,
  drop column projects,
  drop column outcomes;

alter table public.tracks
  add column technical_values text not null default ''
    constraint tracks_technical_values_len check (char_length(technical_values) <= 20000),
  add column personal_values text not null default ''
    constraint tracks_personal_values_len check (char_length(personal_values) <= 20000),
  add column market_values text not null default ''
    constraint tracks_market_values_len check (char_length(market_values) <= 20000),
  add column asset_value text not null default ''
    constraint tracks_asset_value_len check (char_length(asset_value) <= 20000);
