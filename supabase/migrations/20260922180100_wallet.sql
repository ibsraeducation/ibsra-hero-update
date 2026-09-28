-- ==========================================================================
-- The family wallet.
--
-- Until now every payment was a transfer waiting for the admin to check it,
-- which means a family waits to be let in even when they have paid before.
-- The wallet splits that in two:
--
--   1. Charging it — the family sends money by InstaPay or Vodafone Cash and
--      files it exactly as before. It is a `payments` row with kind 'topup'
--      and no student on it. Approving it credits the balance instead of
--      opening a course.
--
--   2. Spending it — paying for a subscription (and the program it opens)
--      out of the balance. That needs nobody: the money is already here, so
--      `pay_from_wallet` deducts it, writes an approved payment for the
--      record, enrols the child and moves their paid-through date, all in
--      one transaction.
--
--   wallets          one row per parent: what they have, in EGP
--   wallet_entries   every movement, with the balance it left behind
--   payments.kind    'program' (a transfer for a student) or 'topup'
-- ==========================================================================

-- ------------------------------------------------- what a payment is for

create type public.pay_kind as enum ('program', 'topup');

alter table public.payments
  add column if not exists kind public.pay_kind not null default 'program';

comment on column public.payments.kind is
  'program: a transfer for one student. topup: money into the family wallet — no student, no program.';

-- A top-up belongs to the family, not to a child, so the student is optional
-- from here on. Every row written before this one is a program payment and
-- keeps its student.
alter table public.payments alter column student_id drop not null;

alter table public.payments
  add constraint payments_student_needed
  check (kind = 'topup' or student_id is not null);

create index if not exists payments_kind_idx on public.payments (kind, status, created_at desc);

-- ------------------------------------------------------------ the wallet

create table public.wallets (
  parent_id   uuid primary key references public.profiles (id) on delete cascade,
  -- EGP, and never negative: spending checks the balance first.
  balance_egp integer not null default 0 check (balance_egp >= 0),
  updated_at  timestamptz not null default now()
);

create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function private.set_updated_at();

create type public.wallet_move as enum ('topup', 'spend', 'refund');

-- Every movement, in the order it happened. `balance_after` is kept on the
-- row so a statement reads the same years later, whatever the balance is by
-- then.
create table public.wallet_entries (
  id            uuid primary key default gen_random_uuid(),
  parent_id     uuid not null references public.profiles (id) on delete cascade,
  move          public.wallet_move not null,
  amount_egp    integer not null check (amount_egp > 0),
  balance_after integer not null check (balance_after >= 0),
  -- What it was: the approved transfer that charged it, or the student and
  -- package it was spent on.
  payment_id    uuid references public.payments (id) on delete set null,
  student_id    uuid references public.profiles (id) on delete set null,
  note          text not null default '' check (char_length(note) <= 300),
  created_at    timestamptz not null default now()
);
create index wallet_entries_parent_idx on public.wallet_entries (parent_id, created_at desc);
create index wallet_entries_payment_idx on public.wallet_entries (payment_id);
create index wallet_entries_student_idx on public.wallet_entries (student_id);

-- ------------------------------------------------------------------ RLS

alter table public.wallets        enable row level security;
alter table public.wallet_entries enable row level security;

revoke all on table public.wallets, public.wallet_entries from anon;

-- Read only, and only your own. Nothing writes a balance except the two
-- functions below, which run as the definer.
create policy wallets_select on public.wallets for select to authenticated
  using ((select private.is_admin()) or parent_id = (select auth.uid()));

create policy wallet_entries_select on public.wallet_entries for select to authenticated
  using ((select private.is_admin()) or parent_id = (select auth.uid()));

-- ---------------------------------------------- filing a top-up transfer
-- The insert policy has to let a top-up through: it names no student.

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and (select private.is_parent())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and (
      (kind = 'topup' and student_id is null and track_id is null and plan is null)
      or (kind = 'program' and student_id in (select private.my_children()))
    )
  );

-- ---------------------------------------------------------- approving it
-- Same button as before, one more thing it can do: a top-up credits the
-- family wallet rather than opening anything.

create or replace function public.approve_payment(p_id uuid, p_note text default null)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay     public.payments;
  v_from    date;
  v_months  integer;
  v_balance integer;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_pay from public.payments p where p.id = p_id for update;
  if v_pay.id is null then
    raise exception 'that payment is gone' using errcode = 'P0002';
  end if;
  if v_pay.status = 'approved' then
    raise exception 'that payment was approved already' using errcode = '23505';
  end if;

  if v_pay.kind = 'topup' then
    -- the wallet: credit it, and keep the movement
    insert into public.wallets (parent_id, balance_egp)
    values (v_pay.parent_id, v_pay.amount_egp)
    on conflict (parent_id) do update
      set balance_egp = public.wallets.balance_egp + excluded.balance_egp
    returning balance_egp into v_balance;

    insert into public.wallet_entries (parent_id, move, amount_egp, balance_after, payment_id, note)
    values (v_pay.parent_id, 'topup', v_pay.amount_egp, v_balance, v_pay.id, 'Transfer approved');
  else
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

-- ------------------------------------------------------ paying out of it
-- The family already sent this money and the admin already checked it, so
-- there is nothing left to approve: the door opens as the balance drops.
-- The price is read from the server's own tables — never from the browser.

create or replace function public.pay_from_wallet(
  p_student uuid,
  p_plan    public.pay_plan,
  p_track   text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent  uuid := (select auth.uid());
  v_price   integer;
  v_on      boolean;
  v_track   integer := 0;
  v_total   integer;
  v_balance integer;
  v_name    text;
  v_months  integer;
  v_from    date;
  v_pay     public.payments;
begin
  if not private.is_parent() then
    raise exception 'only a parent pays from a wallet' using errcode = '42501';
  end if;
  if p_student not in (select private.my_children()) then
    raise exception 'that student is not on your account' using errcode = '42501';
  end if;

  -- what it costs, at today's prices
  select case p_plan
           when 'quarterly'::public.pay_plan   then b.quarterly_egp
           when 'half_annual'::public.pay_plan then b.half_annual_egp
           else b.annual_egp
         end,
         case p_plan
           when 'quarterly'::public.pay_plan   then b.quarterly_on
           when 'half_annual'::public.pay_plan then b.half_annual_on
           else b.annual_on
         end
    into v_price, v_on
    from public.billing_settings b
   where b.id = true;

  if v_price is null or v_price <= 0 or not coalesce(v_on, false) then
    raise exception 'that package is not on sale' using errcode = '22023';
  end if;

  if p_track is not null then
    select coalesce(t.price_egp, 0), t.name into v_track, v_name
      from public.tracks t where t.id = p_track;
    if v_name is null then
      raise exception 'that training program no longer exists' using errcode = 'P0002';
    end if;
  end if;

  v_total := v_price + coalesce(v_track, 0);

  -- take it out of the wallet, or say what is missing
  update public.wallets w
     set balance_egp = w.balance_egp - v_total
   where w.parent_id = v_parent
     and w.balance_egp >= v_total
  returning w.balance_egp into v_balance;

  if v_balance is null then
    raise exception 'there is not enough in the wallet — charge it first' using errcode = '22003';
  end if;

  -- the record of it, approved the moment it is made
  insert into public.payments (
    parent_id, student_id, track_id, program_name, kind, plan, amount_egp,
    method, sender_ref, status, review_note, reviewed_by, reviewed_at
  ) values (
    v_parent, p_student, p_track,
    coalesce(v_name, initcap(replace(p_plan::text, '_', ' ')) || ' subscription'),
    'program', p_plan, v_total,
    'wallet', 'Family wallet', 'approved', 'Paid from the family wallet', v_parent, now()
  )
  returning * into v_pay;

  insert into public.wallet_entries (parent_id, move, amount_egp, balance_after, payment_id, student_id, note)
  values (v_parent, 'spend', v_total, v_balance, v_pay.id, p_student,
          coalesce(v_name, 'Subscription'));

  -- the program it opens
  if p_track is not null then
    insert into public.enrollments (student_id, loop_id, status, enrolled_by)
    select p_student, l.id, 'active', v_parent
    from public.loops l
    where l.track_id = p_track
    on conflict (student_id, loop_id) do update set status = 'active';
  end if;

  -- and the months it buys
  v_months := public.plan_months(p_plan);
  select greatest(coalesce(s.paid_through, current_date), current_date)
    into v_from
    from (select 1) x
    left join public.subscriptions s on s.student_id = p_student;

  insert into public.subscriptions (student_id, paid_through, last_plan)
  values (p_student, (v_from + (v_months || ' months')::interval)::date, p_plan)
  on conflict (student_id) do update
    set paid_through = excluded.paid_through,
        last_plan    = excluded.last_plan;

  return v_pay;
end
$$;
revoke all on function public.pay_from_wallet(uuid, public.pay_plan, text) from public, anon;
grant execute on function public.pay_from_wallet(uuid, public.pay_plan, text) to authenticated;
