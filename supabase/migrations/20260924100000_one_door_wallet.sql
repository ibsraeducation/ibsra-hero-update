-- ==========================================================================
-- One door for money: the wallet.
--
-- Filing a transfer straight against a subscription and paying a program or
-- a course on its own are both gone. A family charges its wallet by
-- InstaPay or Vodafone Cash, the admin approves the transfer into the
-- wallet, and every subscription is paid from that balance. What a student
-- may open is never bought — it is asked for in the Marketplace and granted
-- by the admin, and only once the family has paid.
-- ==========================================================================

-- ---------------------------------------------------------- pay_from_wallet
-- Keeps its four-parameter signature so a client mid-deploy never calls a
-- function that has vanished; a track or a course passed in is now refused
-- rather than quietly priced and enrolled.

create or replace function public.pay_from_wallet(
  p_student uuid,
  p_plan    public.pay_plan,
  p_track   text default null,
  p_loop    text default null
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
  if p_track is not null or p_loop is not null then
    raise exception 'programs are not sold — ask for them in the Marketplace'
      using errcode = '22023';
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

  v_name := initcap(replace(p_plan::text, '_', ' ')) || ' subscription';

  update public.wallets w
     set balance_egp = w.balance_egp - v_price
   where w.parent_id = v_parent
     and w.balance_egp >= v_price
  returning w.balance_egp into v_balance;

  if v_balance is null then
    raise exception 'there is not enough in the wallet — charge it first' using errcode = '22003';
  end if;

  insert into public.payments (
    parent_id, student_id, track_id, loop_id, program_name, kind, plan, amount_egp,
    method, sender_ref, status, review_note, reviewed_by, reviewed_at
  ) values (
    v_parent, p_student, null, null, v_name,
    'program', p_plan, v_price,
    'wallet', 'Family wallet', 'approved', 'Paid from the family wallet', v_parent, now()
  )
  returning * into v_pay;

  insert into public.wallet_entries (parent_id, move, amount_egp, balance_after, payment_id, student_id, note)
  values (v_parent, 'spend', v_price, v_balance, v_pay.id, p_student, v_name);

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
revoke all on function public.pay_from_wallet(uuid, public.pay_plan, text, text) from public, anon;
grant execute on function public.pay_from_wallet(uuid, public.pay_plan, text, text) to authenticated;

-- ------------------------------------------------------------ payments_insert
-- A family may only ever file a wallet top-up now — never a subscription
-- transfer for themselves. Paying is charge-the-wallet, then spend-it.

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (
    parent_id = (select auth.uid())
    and (select private.is_parent())
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
    and kind = 'topup'
    and student_id is null
    and track_id is null
    and loop_id is null
    and plan is null
  );

-- ------------------------------------------------------------- answer_request
-- Same body, with one more check before a course opens: the hero has to
-- have a live subscription. Declining never needed one and still does not.

create or replace function public.answer_request(
  p_id      uuid,
  p_approve boolean,
  p_loops   text[] default null,
  p_note    text default null
)
returns public.access_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req   public.access_requests;
  v_admin uuid := (select auth.uid());
  v_n     integer := 0;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  select * into v_req from public.access_requests r where r.id = p_id for update;
  if v_req.id is null then
    raise exception 'that request is gone' using errcode = 'P0002';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'that request was answered already' using errcode = '23505';
  end if;

  if p_approve then
    if not exists (
      select 1 from public.subscriptions s
       where s.student_id = v_req.student_id
         and s.paid_through >= current_date
    ) then
      raise exception 'that student has no live subscription — the family pays the months first'
        using errcode = '22023';
    end if;

    insert into public.enrollments (student_id, loop_id, status, enrolled_by)
    select v_req.student_id, l.id, 'active', v_admin
      from public.loops l
     where l.id = any(coalesce(p_loops, array[]::text[]))
       and (
         (v_req.loop_id is not null and l.id = v_req.loop_id)
         or (v_req.track_id is not null and l.track_id = v_req.track_id)
       )
    on conflict (student_id, loop_id) do update set status = 'active';
    get diagnostics v_n = row_count;

    if v_n = 0 then
      raise exception 'tick at least one course to open' using errcode = '22023';
    end if;
  end if;

  update public.access_requests r
     set status      = case when p_approve then 'approved' else 'declined' end,
         answer_note = left(coalesce(p_note, ''), 600),
         answered_by = v_admin,
         answered_at = now()
   where r.id = p_id
  returning * into v_req;

  return v_req;
end
$$;
revoke all on function public.answer_request(uuid, boolean, text[], text) from public, anon;
grant execute on function public.answer_request(uuid, boolean, text[], text) to authenticated;
