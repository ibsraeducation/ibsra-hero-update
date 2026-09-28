-- ==========================================================================
-- Work: a second admin area beside Material, where the student works on
-- their own assets. Each area has its own programs; a program's courses and
-- sessions go with it, so the area lives on the program alone and nothing is
-- shared between the two. Every existing program stays in Material.
-- ==========================================================================

alter table public.tracks
  add column area text not null default 'material'
    constraint tracks_area_valid check (area in ('material', 'work'));
