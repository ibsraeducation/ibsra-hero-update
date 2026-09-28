-- ==========================================================================
-- Families, prices and payments.
--
-- A parent signs up, adds their children, and buys a training program for
-- one of them. Payment is a transfer the family makes themselves — InstaPay
-- or Vodafone Cash — so what arrives here is a claim: amount, method, the
-- reference they sent it with, and a screenshot. Nothing opens on that claim
-- alone. The admin reads it on the payments page and approves it, and the
-- approval is what enrols the child in every course of the program.
--
--   guardians          parent → child
--   tracks.price_egp   what a program costs, set by the admin
--   pay_accounts       the numbers a family sends the money to
--   payments           one transfer, pending until the admin says otherwise
-- ==========================================================================

-- ------------------------------------------------------------- the price

alter table public.tracks
  add column if not exists price_egp integer
  check (price_egp is null or (price_egp >= 0 and price_egp <= 10000000));

comment on column public.tracks.price_egp is
  'EGP. null means the program is not for sale yet — never shown as free.';

-- ------------------------------------------------------------ the family

create table public.guardians (
  parent_id  uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);
create index guardians_student_idx on public.guardians (student_id);

create or replace function private.is_parent()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'parent' and not p.disabled
  )
$$;
revoke all on function private.is_parent() from public, anon;
grant execute on function private.is_parent() to authenticated, service_role;

-- The children of the signed-in parent. Empty for anybody else.
create or replace function private.my_children()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.student_id from public.guardians g where g.parent_id = (select auth.uid())
$$;
revoke all on function private.my_children() from public, anon;
grant execute on function private.my_children() to authenticated;

-- -------------------------------------------------- where the money goes

create table public.pay_accounts (
  id              boolean primary key default true check (id),
  instapay_handle text not null default '' check (char_length(instapay_handle) <= 160),
  vodafone_number text not null default '' check (char_length(vodafone_number) <= 40),
  instructions    text not null default '' check (char_length(instructions) <= 2000),
  updated_at      timestamptz not null default now()
);
insert into public.pay_accounts (id) values (true) on conflict (id) do nothing;

create trigger pay_accounts_set_updated_at
  before update on public.pay_accounts
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------- payments

create type public.pay_method as enum ('instapay', 'vodafone_cash');
create type public.pay_status as enum ('pending', 'approved', 'rejected');

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references public.profiles (id) on delete cascade,
  student_id   uuid not null references public.profiles (id) on delete cascade,
  -- The program is kept by name too: a payment is a money record, and it
  -- must still read right if the program itself is deleted later.
  track_id     text references public.tracks (id) on delete set null,
  program_name text not null default '' check (char_length(program_name) <= 160),
  amount_egp   integer not null check (amount_egp > 0 and amount_egp <= 10000000),
  method       public.pay_method not null,
  -- The wallet or InstaPay address it was sent from, or the transfer number.
  sender_ref   text not null default '' check (char_length(sender_ref) <= 160),
  proof_path   text check (char_length(proof_path) <= 500),
  note         text check (char_length(note) <= 1000),
  status       public.pay_status not null default 'pending',
  review_note  text check (char_length(review_note) <= 1000),
  reviewed_by  uuid references public.profiles (id) on delete set null,
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index payments_status_idx  on public.payments (status, created_at desc);
create index payments_parent_idx  on public.payments (parent_id);
create index payments_student_idx on public.payments (student_id);
create index payments_reviewed_by_idx on public.payments (reviewed_by);
create index payments_track_idx on public.payments (track_id);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function private.set_updated_at();

-- ------------------------------------------------------------------ RLS

alter table public.guardians    enable row level security;
alter table public.payments     enable row level security;
alter table public.pay_accounts enable row level security;

revoke all on table public.guardians, public.payments, public.pay_accounts from anon;

-- guardians: read only here. The link is written by the parent-users Edge
-- Function (service role), the only way a child account is created.
create policy guardians_select on public.guardians for select to authenticated
  using ((select private.is_admin()) or parent_id = (select auth.uid()));

-- payments: a parent files their own, and can never review one.
create policy payments_select on public.payments for select to authenticated
  using ((select private.is_admin()) or parent_id = (select auth.uid()));
create policy payments_insert on public.payments for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and (select private.is_parent())
    and student_id in (select private.my_children())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );
create policy payments_update on public.payments for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy payments_delete on public.payments for delete to authenticated
  using ((select private.is_admin()));

-- where to send the money: everyone signed in reads it, the admin writes it.
create policy pay_accounts_select on public.pay_accounts for select to authenticated
  using (true);
create policy pay_accounts_write on public.pay_accounts for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- profiles: a parent sees their own children as well as themselves.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or id in (select private.my_children())
  );

-- enrolments: a parent sees what their children are enrolled in.
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments for select to authenticated
  using (
    (select private.is_admin())
    or student_id = (select auth.uid())
    or student_id in (select private.my_children())
  );

-- the catalogue: a parent reads the programs and their courses in order to
-- buy one. Sessions stay out of reach — those belong to the student.
drop policy if exists tracks_select on public.tracks;
create policy tracks_select on public.tracks for select to authenticated
  using (
    (select private.is_admin())
    or (select private.is_parent())
    or id in (select private.my_track_ids())
  );

drop policy if exists loops_select on public.loops;
create policy loops_select on public.loops for select to authenticated
  using (
    (select private.is_admin())
    or (select private.is_parent())
    or track_id in (select private.my_track_ids())
  );

-- ------------------------------------------------------- approve / reject
-- Approving is what opens the program: every course in it is enrolled for
-- that child. Rejecting leaves the family exactly where they were.

create or replace function public.approve_payment(p_id uuid, p_note text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_pay from public.payments p where p.id = p_id for update;
  if v_pay.id is null then
    raise exception 'that payment is gone' using errcode = 'P0002';
  end if;
  if v_pay.track_id is null then
    raise exception 'that training program no longer exists' using errcode = '23503';
  end if;

  insert into public.enrollments (student_id, loop_id, status, enrolled_by)
  select v_pay.student_id, l.id, 'active', (select auth.uid())
  from public.loops l
  where l.track_id = v_pay.track_id
  on conflict (student_id, loop_id) do update set status = 'active';

  update public.payments p
     set status = 'approved',
         review_note = left(coalesce(p_note, ''), 1000),
         reviewed_by = (select auth.uid()),
         reviewed_at = now()
   where p.id = p_id
  returning * into v_pay;

  return v_pay;
end
$$;
revoke all on function public.approve_payment(uuid, text) from public, anon;
grant execute on function public.approve_payment(uuid, text) to authenticated;

create or replace function public.reject_payment(p_id uuid, p_note text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  update public.payments p
     set status = 'rejected',
         review_note = left(coalesce(p_note, ''), 1000),
         reviewed_by = (select auth.uid()),
         reviewed_at = now()
   where p.id = p_id
  returning * into v_pay;

  if v_pay.id is null then
    raise exception 'that payment is gone' using errcode = 'P0002';
  end if;
  return v_pay;
end
$$;
revoke all on function public.reject_payment(uuid, text) from public, anon;
grant execute on function public.reject_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------- the proof file
-- <parent uuid>/<uuid>-<file name>. Private: the parent who sent it and the
-- admin reviewing it, nobody else.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 10485760, array['image/*', 'application/pdf'])
on conflict (id) do nothing;

create policy "ibsra pay proofs read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select private.is_admin()))
  );

create policy "ibsra pay proofs insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select private.is_parent())
  );

create policy "ibsra pay proofs delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-proofs' and (select private.is_admin()));

-- ---------------------------------------------------------- who may sign up
-- Parents, and only parents. A sign-up asking for anything else still lands
-- as a disabled student, exactly as before. Children are created by the
-- `parent-users` function, which stamps created_by on the auth user.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_boot      text;
  v_is_boot   boolean;
  v_by_admin  boolean;
  v_by_parent boolean;
  v_signup    boolean;
begin
  select s.value into v_boot from private.settings s where s.key = 'bootstrap_admin_email';
  v_is_boot   := new.email is not null
                 and lower(new.email) = lower(v_boot)
                 and new.email_confirmed_at is not null;
  v_by_admin  := coalesce(new.raw_app_meta_data ->> 'created_by', '') = 'admin-users';
  v_by_parent := coalesce(new.raw_app_meta_data ->> 'created_by', '') = 'parent-users';
  -- The public sign-up form asks for the parent role, and nothing else can.
  v_signup    := not (v_is_boot or v_by_admin or v_by_parent)
                 and coalesce(new.raw_user_meta_data ->> 'account', '') = 'parent';

  insert into public.profiles (id, role, name, email, phone, disabled, must_change_password)
  values (
    new.id,
    case
      when v_is_boot then 'admin'::public.app_role
      when v_signup  then 'parent'::public.app_role
      else 'student'::public.app_role
    end,
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 120),
    coalesce(new.email, ''),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'phone', ''), 32), ''),
    not (v_is_boot or v_by_admin or v_by_parent or v_signup),
    v_by_admin
  )
  on conflict (id) do nothing;
  return new;
end
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
