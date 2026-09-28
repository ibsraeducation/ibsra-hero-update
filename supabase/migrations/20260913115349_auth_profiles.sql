-- ==========================================================================
-- Accounts and roles.
--
-- Two roles only: admin and student. Nobody signs up on their own — an admin
-- creates student accounts through the `admin-users` Edge Function, and the
-- first admin is the owner's own dashboard-created user (bootstrap email).
-- Anything created any other way starts disabled.
-- ==========================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role, supabase_auth_admin;

create type public.app_role as enum ('admin', 'student');

create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  role                 public.app_role not null default 'student',
  name                 text not null default '' check (char_length(name) <= 120),
  email                text not null default '' check (char_length(email) <= 254),
  age                  smallint check (age between 8 and 99),
  phone                text check (char_length(phone) <= 32),
  disabled             boolean not null default false,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create unique index profiles_email_key on public.profiles (lower(email)) where email <> '';
create index profiles_role_idx on public.profiles (role);

-- Not exposed through the API: no grants to anon or authenticated.
create table private.settings (
  key   text primary key,
  value text not null
);
insert into private.settings (key, value) values ('bootstrap_admin_email', 'ibsra.education@gmail.com');

-- ---------------------------------------------------------------- helpers

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
revoke all on function private.set_updated_at() from public;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin' and not p.disabled
  )
$$;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;

-- ------------------------------------------------- profile per auth user

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_boot     text;
  v_is_boot  boolean;
  v_by_admin boolean;
begin
  select s.value into v_boot from private.settings s where s.key = 'bootstrap_admin_email';
  v_is_boot  := new.email is not null
                and lower(new.email) = lower(v_boot)
                and new.email_confirmed_at is not null;
  v_by_admin := coalesce(new.raw_app_meta_data ->> 'created_by', '') = 'admin-users';

  insert into public.profiles (id, role, name, email, disabled, must_change_password)
  values (
    new.id,
    case when v_is_boot then 'admin'::public.app_role else 'student'::public.app_role end,
    left(coalesce(new.raw_user_meta_data ->> 'name', ''), 120),
    coalesce(new.email, ''),
    not (v_is_boot or v_by_admin),
    v_by_admin
  )
  on conflict (id) do nothing;
  return new;
end
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep the profile's email in step with auth. Deliberately no role change
-- here: promotion to admin happens only when the account is first created.
create or replace function private.handle_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles p
     set email = coalesce(new.email, '')
   where p.id = new.id
     and p.email is distinct from coalesce(new.email, '');
  return new;
end
$$;
revoke all on function private.handle_user_updated() from public, anon, authenticated;

create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute function private.handle_user_updated();

-- ------------------------------------------------------ profile guard
-- Applies to signed-in API callers only (auth.uid() set). The Edge Function
-- (service role) and SQL run without a user and pass through.

create or replace function private.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return new;
  end if;
  if new.id is distinct from old.id then
    raise exception 'profile id is read-only' using errcode = '42501';
  end if;
  if new.email is distinct from old.email then
    raise exception 'email changes go through the admin' using errcode = '42501';
  end if;
  if new.role is distinct from old.role or new.disabled is distinct from old.disabled then
    if not private.is_admin() or new.id = v_uid then
      raise exception 'not allowed to change role or access' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.profiles_guard() from public, anon;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function private.profiles_guard();

-- The signed-in user clears their own "must change password" flag after
-- changing it. A nudge for the UI, not a security control.
create or replace function public.password_changed()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set must_change_password = false where id = (select auth.uid());
$$;
revoke all on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;

-- ------------------------------------------------------------------ RLS

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy profiles_update on public.profiles
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- -------------------------------------------------------------- backfill
-- In case the owner's admin user was created before this migration ran.

insert into public.profiles (id, role, name, email, disabled, must_change_password)
select
  u.id,
  case when lower(coalesce(u.email, '')) = 'ibsra.education@gmail.com' and u.email_confirmed_at is not null
       then 'admin'::public.app_role else 'student'::public.app_role end,
  left(coalesce(u.raw_user_meta_data ->> 'name', ''), 120),
  coalesce(u.email, ''),
  not (
    (lower(coalesce(u.email, '')) = 'ibsra.education@gmail.com' and u.email_confirmed_at is not null)
    or coalesce(u.raw_app_meta_data ->> 'created_by', '') = 'admin-users'
  ),
  coalesce(u.raw_app_meta_data ->> 'created_by', '') = 'admin-users'
from auth.users u
on conflict (id) do nothing;
