-- ==========================================================================
-- Four packages, two channels that can be closed, and a door that shuts
-- before the money runs out.
--
--   1. The monthly price and its switch, beside the other three.
--   2. Each way of paying is opened or closed on its own. A closed channel
--      keeps its link and its QR and is simply not offered. The Vodafone
--      number goes with this: that channel is a link and a QR now, so the
--      column is left where it is and nothing reads it.
--   3. The closing day of the month is replaced by a plainer rule: the
--      platform shuts a set number of days BEFORE the date a family is paid
--      up to — five by default — so they renew while it is still open. The
--      line the admin used to write under the packages goes with it.
-- ==========================================================================

-- ------------------------------------------------------- the two channels

alter table public.pay_accounts
  add column if not exists instapay_on boolean not null default true,
  add column if not exists vodafone_on boolean not null default true;

comment on column public.pay_accounts.instapay_on is
  'A closed channel is not offered to families, and keeps its link and QR.';
comment on column public.pay_accounts.vodafone_on is
  'A closed channel is not offered to families, and keeps its link and QR.';
comment on column public.pay_accounts.vodafone_number is
  'No longer shown: Vodafone Cash is offered as a link and a QR.';

-- ------------------------------------------------- monthly, and the rule

alter table public.billing_settings
  add column if not exists monthly_egp integer
    check (monthly_egp is null or (monthly_egp > 0 and monthly_egp <= 10000000)),
  add column if not exists monthly_on boolean not null default true,
  -- How many days BEFORE the paid-through date the platform shuts. Five
  -- means a child paid up to the 26th is locked out on the 21st. Zero shuts
  -- on the date itself.
  add column if not exists close_before_days smallint not null default 5
    check (close_before_days between 0 and 60);

alter table public.billing_settings
  drop column if exists close_day,
  drop column if exists note;

-- How many months each package buys, now that there is a monthly one.
create or replace function public.plan_months(p public.pay_plan)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p
    when 'monthly'::public.pay_plan     then 1
    when 'quarterly'::public.pay_plan   then 3
    when 'half_annual'::public.pay_plan then 6
    else 12
  end
$$;
grant execute on function public.plan_months(public.pay_plan) to authenticated, anon;

-- ------------------------------------------- the wallet knows the price
-- Unchanged but for the two monthly branches: without them a monthly
-- package reads as having no price and cannot be paid for at all.

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

  select case p_plan
           when 'monthly'::public.pay_plan     then b.monthly_egp
           when 'quarterly'::public.pay_plan   then b.quarterly_egp
           when 'half_annual'::public.pay_plan then b.half_annual_egp
           when 'annual'::public.pay_plan      then b.annual_egp
           else null
         end,
         case p_plan
           when 'monthly'::public.pay_plan     then b.monthly_on
           when 'quarterly'::public.pay_plan   then b.quarterly_on
           when 'half_annual'::public.pay_plan then b.half_annual_on
           when 'annual'::public.pay_plan      then b.annual_on
           else false
         end
    into v_price, v_on
    from public.billing_settings b
   where b.id = true;

  if v_price is null or v_price <= 0 or not coalesce(v_on, false) then
    raise exception 'that package cannot be paid from the wallet' using errcode = '22023';
  end if;

  if p_track is not null then
    select coalesce(t.price_egp, 0), t.name into v_track, v_name
      from public.tracks t where t.id = p_track;
    if v_name is null then
      raise exception 'that training program no longer exists' using errcode = 'P0002';
    end if;
  end if;

  v_total := v_price + coalesce(v_track, 0);

  update public.wallets w
     set balance_egp = w.balance_egp - v_total
   where w.parent_id = v_parent
     and w.balance_egp >= v_total
  returning w.balance_egp into v_balance;

  if v_balance is null then
    raise exception 'there is not enough in the wallet — charge it first' using errcode = '22003';
  end if;

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

  if p_track is not null then
    insert into public.enrollments (student_id, loop_id, status, enrolled_by)
    select p_student, l.id, 'active', v_parent
    from public.loops l
    where l.track_id = p_track
    on conflict (student_id, loop_id) do update set status = 'active';
  end if;

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
