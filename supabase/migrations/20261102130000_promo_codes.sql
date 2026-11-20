-- ==========================================================================
-- Promo codes: a code that opens a course (or every course of a program)
-- for free. The admin makes them and decides whether and when each one
-- expires; a family redeems one for a hero on their own account.
--
-- Redeeming is the enrolment, written in the same transaction that counts
-- the use, so a code is never spent without opening anything. It is an RPC,
-- not an insert from the browser: a parent has no insert policy on
-- enrollments, and the check that the hero is theirs cannot be left to the
-- client.
-- ==========================================================================

create table public.promo_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[A-Z0-9_-]{3,32}$'),
  track_id       text references public.tracks (id) on delete cascade,
  loop_id        text references public.loops  (id) on delete cascade,
  -- The admin's switch: off stops the code at once, whatever its date says.
  active         boolean not null default true,
  -- null means it never expires.
  expires_at     timestamptz,
  redeemed_count integer not null default 0,
  created_at     timestamptz not null default now(),
  constraint promo_one_target check (num_nonnulls(track_id, loop_id) = 1)
);
create index promo_codes_track_idx on public.promo_codes (track_id);
create index promo_codes_loop_idx  on public.promo_codes (loop_id);

create table public.promo_redemptions (
  promo_id    uuid not null references public.promo_codes (id) on delete cascade,
  student_id  uuid not null references public.profiles (id) on delete cascade,
  redeemed_by uuid references public.profiles (id) on delete set null,
  redeemed_at timestamptz not null default now(),
  primary key (promo_id, student_id)
);
create index promo_redemptions_student_idx on public.promo_redemptions (student_id);
create index promo_redemptions_by_idx on public.promo_redemptions (redeemed_by);

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

create policy promo_codes_admin on public.promo_codes for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy promo_redemptions_admin on public.promo_redemptions for select to authenticated
  using ((select private.is_admin()));

create function public.redeem_promo(p_code text, p_student uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me    uuid := (select auth.uid());
  v_promo public.promo_codes;
  v_n     integer;
begin
  if not (select private.is_parent()) then
    raise exception 'only a family can redeem a code' using errcode = '42501';
  end if;
  if p_student not in (select private.my_children()) then
    raise exception 'that hero is not on your account' using errcode = '42501';
  end if;

  select * into v_promo from public.promo_codes c
   where c.code = upper(btrim(coalesce(p_code, ''))) for update;
  if v_promo.id is null or not v_promo.active
     or (v_promo.expires_at is not null and v_promo.expires_at <= now()) then
    raise exception 'that code is not valid' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.promo_redemptions r
              where r.promo_id = v_promo.id and r.student_id = p_student) then
    raise exception 'this hero already used that code' using errcode = '23505';
  end if;

  insert into public.enrollments (student_id, loop_id, status, enrolled_by)
  select p_student, l.id, 'active', v_me
    from public.loops l
   where l.id = v_promo.loop_id or l.track_id = v_promo.track_id
  on conflict (student_id, loop_id) do update set status = 'active';
  get diagnostics v_n = row_count;

  insert into public.promo_redemptions (promo_id, student_id, redeemed_by)
  values (v_promo.id, p_student, v_me);
  update public.promo_codes set redeemed_count = redeemed_count + 1 where id = v_promo.id;

  return jsonb_build_object('courses', v_n);
end $$;
revoke all on function public.redeem_promo(text, uuid) from public, anon;
grant execute on function public.redeem_promo(text, uuid) to authenticated;
