-- ==========================================================================
-- A Work project is never sold — and a course goes with its program.
--
-- Work is where a student builds their own assets; a mentor puts them on a
-- project, nobody buys one. The listing flags default to true, so a Work
-- program carries one like any other row — this folds the area into the same
-- check that reads the price, so being on sale is impossible rather than
-- merely hidden from the family Marketplace. Taking a program off sale takes
-- its courses with it: 'off sale' means the whole thing, not the cover.
-- ==========================================================================

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
  v_content integer := 0;
  v_total   integer;
  v_balance integer;
  v_name    text;
  v_track   text := p_track;
  v_listed  boolean;
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

  -- One course, priced on its own row. It has to be both listed and priced,
  -- whatever the page that called this believed.
  if p_loop is not null then
    select l.price_egp, l.name, l.track_id,
           l.listed and t.listed and coalesce(t.area, 'material') <> 'work'
      into v_content, v_name, v_track, v_listed
      from public.loops l
      join public.tracks t on t.id = l.track_id
     where l.id = p_loop;
    if v_name is null then
      raise exception 'that course no longer exists' using errcode = 'P0002';
    end if;
    if not coalesce(v_listed, false) or v_content is null then
      raise exception 'that course is not on sale on its own' using errcode = '22023';
    end if;
  elsif p_track is not null then
    select coalesce(t.price_egp, 0), t.name,
           t.listed and coalesce(t.area, 'material') <> 'work'
      into v_content, v_name, v_listed
      from public.tracks t where t.id = p_track;
    if v_name is null then
      raise exception 'that training program no longer exists' using errcode = 'P0002';
    end if;
    if not coalesce(v_listed, false) then
      raise exception 'that training program is not on sale' using errcode = '22023';
    end if;
  end if;

  v_total := v_price + coalesce(v_content, 0);

  update public.wallets w
     set balance_egp = w.balance_egp - v_total
   where w.parent_id = v_parent
     and w.balance_egp >= v_total
  returning w.balance_egp into v_balance;

  if v_balance is null then
    raise exception 'there is not enough in the wallet — charge it first' using errcode = '22003';
  end if;

  insert into public.payments (
    parent_id, student_id, track_id, loop_id, program_name, kind, plan, amount_egp,
    method, sender_ref, status, review_note, reviewed_by, reviewed_at
  ) values (
    v_parent, p_student, v_track, p_loop,
    coalesce(v_name, initcap(replace(p_plan::text, '_', ' ')) || ' subscription'),
    'program', p_plan, v_total,
    'wallet', 'Family wallet', 'approved', 'Paid from the family wallet', v_parent, now()
  )
  returning * into v_pay;

  insert into public.wallet_entries (parent_id, move, amount_egp, balance_after, payment_id, student_id, note)
  values (v_parent, 'spend', v_total, v_balance, v_pay.id, p_student,
          coalesce(v_name, 'Subscription'));

  -- What it opens: the one course, or every course of the program.
  if p_loop is not null then
    insert into public.enrollments (student_id, loop_id, status, enrolled_by)
    values (p_student, p_loop, 'active', v_parent)
    on conflict (student_id, loop_id) do update set status = 'active';
  elsif p_track is not null then
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
revoke all on function public.pay_from_wallet(uuid, public.pay_plan, text, text) from public, anon;
grant execute on function public.pay_from_wallet(uuid, public.pay_plan, text, text) to authenticated;
