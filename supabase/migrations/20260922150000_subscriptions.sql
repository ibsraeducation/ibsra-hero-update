-- ==========================================================================
-- Subscriptions: the platform is paid for in packages, not per program.
--
-- The admin sets three prices once — quarterly, half-yearly, annual — and
-- decides which of them a family is allowed to pick. A family sends the
-- money the way they always have (InstaPay or Vodafone Cash, now with a
-- payment link and a QR code they can scan), files the transfer, and the
-- admin approves it. Approving extends that child's `paid_through`.
--
-- After `paid_through` the child is not cut off that same night: the admin
-- also sets a day of the month, and the door closes on the first such day
-- on or after the date they were paid up to. That is the countdown the
-- parent sees in the top bar.
--
--   billing_settings   the three prices, which are offered, the closing day
--   subscriptions      one row per child: the date they are paid up to
--   payments.plan      which package a transfer was for
--   pay_accounts.*     the link and the QR next to each number
-- ==========================================================================

-- ------------------------------------------------- the link and the QR

alter table public.pay_accounts
  add column if not exists instapay_link   text not null default '' check (char_length(instapay_link) <= 500),
  add column if not exists instapay_qr     text          default null,
  add column if not exists vodafone_link   text not null default '' check (char_length(vodafone_link) <= 500),
  add column if not exists vodafone_qr     text          default null;

comment on column public.pay_accounts.instapay_qr is
  'Path in the public pay-qr bucket. null means no QR was uploaded.';

-- The QR codes are shown to every family before they pay, so the bucket is
-- public: there is nothing private in a payment QR. Only the admin writes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pay-qr', 'pay-qr', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "ibsra pay qr write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pay-qr' and (select private.is_admin()));

create policy "ibsra pay qr replace" on storage.objects
  for update to authenticated
  using (bucket_id = 'pay-qr' and (select private.is_admin()))
  with check (bucket_id = 'pay-qr' and (select private.is_admin()));

create policy "ibsra pay qr delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pay-qr' and (select private.is_admin()));

-- --------------------------------------------------------- the packages

create type public.pay_plan as enum ('quarterly', 'half_annual', 'annual');

-- How many months each package buys. Kept in the database because
-- `approve_payment` has to do the arithmetic itself.
create or replace function public.plan_months(p public.pay_plan)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'quarterly'::public.pay_plan   then 3
    when 'half_annual'::public.pay_plan then 6
    else 12
  end
$$;
grant execute on function public.plan_months(public.pay_plan) to authenticated, anon;

create table public.billing_settings (
  id               boolean primary key default true check (id),
  -- null is not free: it means the package has no price yet and cannot be
  -- offered, exactly like tracks.price_egp.
  quarterly_egp    integer check (quarterly_egp is null or (quarterly_egp > 0 and quarterly_egp <= 10000000)),
  half_annual_egp  integer check (half_annual_egp is null or (half_annual_egp > 0 and half_annual_egp <= 10000000)),
  annual_egp       integer check (annual_egp is null or (annual_egp > 0 and annual_egp <= 10000000)),
  -- Which of the three a family may pick. A priced package that is off is
  -- simply not shown.
  quarterly_on     boolean not null default true,
  half_annual_on   boolean not null default true,
  annual_on        boolean not null default true,
  -- The day of the month the platform closes for a child who is past their
  -- date. 1–28 so every month really has it.
  close_day        smallint not null default 5 check (close_day between 1 and 28),
  -- Shown to the family under the packages. Optional.
  note             text not null default '' check (char_length(note) <= 2000),
  updated_at       timestamptz not null default now()
);
insert into public.billing_settings (id) values (true) on conflict (id) do nothing;

create trigger billing_settings_set_updated_at
  before update on public.billing_settings
  for each row execute function private.set_updated_at();

alter table public.billing_settings enable row level security;
revoke all on table public.billing_settings from anon;

-- Everyone signed in reads it — the parent to pay, the student to be told
-- why the door shut. Only the admin writes it.
create policy billing_settings_select on public.billing_settings for select to authenticated
  using (true);
create policy billing_settings_write on public.billing_settings for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ----------------------------------------------------- what is paid for

create table public.subscriptions (
  student_id   uuid primary key references public.profiles (id) on delete cascade,
  -- The last day covered by what the family has paid. There is no row until
  -- the first payment is approved, and no row means nothing is blocked:
  -- a child is only ever cut off after having been paid up once.
  paid_through date not null,
  last_plan    public.pay_plan,
  updated_at   timestamptz not null default now()
);

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();

alter table public.subscriptions enable row level security;
revoke all on table public.subscriptions from anon;

-- The child sees their own date, the parent sees their children's, the
-- admin sees all of them. Nobody but `approve_payment` writes one.
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (
    (select private.is_admin())
    or student_id = (select auth.uid())
    or student_id in (select private.my_children())
  );

-- ------------------------------------------------ the plan on a payment

alter table public.payments
  add column if not exists plan public.pay_plan;

comment on column public.payments.plan is
  'Which package the transfer was for. null on the program-only payments filed before subscriptions existed.';

-- A payment is for a program, a package, or both. That is not a CHECK
-- constraint: deleting a program sets `track_id` to null, and a money record
-- from last year must never stand in the way of that.

-- A parent files their own, and now names the package too.
drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and (select private.is_parent())
    and student_id in (select private.my_children())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

-- --------------------------------------------------------- approving it
-- Approving still enrols — that has not changed. What is new is that a
-- payment carrying a package also pushes the child's paid-through date
-- forward: from today, or from the date they are already paid up to if
-- they renewed early, so renewing ahead of time is never punished.

create or replace function public.approve_payment(p_id uuid, p_note text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay    public.payments;
  v_from   date;
  v_months integer;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_pay from public.payments p where p.id = p_id for update;
  if v_pay.id is null then
    raise exception 'that payment is gone' using errcode = 'P0002';
  end if;
  if v_pay.track_id is null and v_pay.plan is null then
    raise exception 'that training program no longer exists' using errcode = '23503';
  end if;

  -- the program, if this payment named one
  if v_pay.track_id is not null then
    insert into public.enrollments (student_id, loop_id, status, enrolled_by)
    select v_pay.student_id, l.id, 'active', (select auth.uid())
    from public.loops l
    where l.track_id = v_pay.track_id
    on conflict (student_id, loop_id) do update set status = 'active';
  end if;

  -- the package, if this payment named one
  if v_pay.plan is not null then
    v_months := public.plan_months(v_pay.plan);
    select greatest(coalesce(s.paid_through, current_date), current_date)
      into v_from
      from (select 1) x
      left join public.subscriptions s on s.student_id = v_pay.student_id;

    insert into public.subscriptions (student_id, paid_through, last_plan)
    values (v_pay.student_id, (v_from + (v_months || ' months')::interval)::date, v_pay.plan)
    on conflict (student_id) do update
      set paid_through = excluded.paid_through,
          last_plan    = excluded.last_plan;
  end if;

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
