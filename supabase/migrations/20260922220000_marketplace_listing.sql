-- ==========================================================================
-- What the Marketplace sells is what Material holds.
--
-- Until now a family was shown every program in Material that had a course
-- in it, whether or not anybody meant to sell it, and a course could not be
-- sold at all — the whole program or nothing. Both are decided in Material
-- from here on:
--
--   tracks.listed    show this training program in the Marketplace
--   loops.listed     show this course in the Marketplace on its own
--   loops.price_egp  what that one course costs. Null is not for sale —
--                    never rendered as free, exactly like a program's price.
--
-- Both flags default to true, so nothing a family can see today disappears:
-- a program is listed the moment it is added, and the toggle is how it comes
-- off sale. A course still needs a price of its own before it is offered
-- separately, so no course goes on sale by accident either.
--
-- And because a course can now be bought on its own, a payment can name one:
--
--   payments.loop_id  the single course this buys. Null is the whole program.
--
-- The flags are enforced here, not in the browser: `pay_from_wallet` refuses
-- anything that is not on sale, whatever the page that called it believed.
-- ==========================================================================

-- ------------------------------------------------------------ the flags

alter table public.tracks
  add column if not exists listed boolean not null default true;

alter table public.loops
  add column if not exists listed boolean not null default true,
  add column if not exists price_egp integer
    check (price_egp is null or (price_egp >= 0 and price_egp <= 10000000));

comment on column public.tracks.listed is
  'Show this training program in the Marketplace. False keeps it in Material and off sale.';
comment on column public.loops.listed is
  'Offer this course in the Marketplace on its own. It also needs price_egp before it is sold.';
comment on column public.loops.price_egp is
  'EGP for this one course. Null means it is only sold as part of its program.';

-- ------------------------------------------------- a payment for one course

alter table public.payments
  add column if not exists loop_id text references public.loops (id) on delete set null;

comment on column public.payments.loop_id is
  'The single course this payment buys. Null means the whole program named by track_id.';

create index if not exists payments_loop_idx on public.payments (loop_id);

-- --------------------------------------------------------- approving one
-- Unchanged but for one branch: a payment that names a course opens that
-- course, rather than every course of its program.

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
    insert into public.wallets (parent_id, balance_egp)
    values (v_pay.parent_id, v_pay.amount_egp)
    on conflict (parent_id) do update
      set balance_egp = public.wallets.balance_egp + excluded.balance_egp
    returning balance_egp into v_balance;

    insert into public.wallet_entries (parent_id, move, amount_egp, balance_after, payment_id, note)
    values (v_pay.parent_id, 'topup', v_pay.amount_egp, v_balance, v_pay.id, 'Transfer approved');
  else
    if v_pay.track_id is null and v_pay.loop_id is null and v_pay.plan is null then
      raise exception 'that training program no longer exists' using errcode = '23503';
    end if;

    -- One course, when the payment named one; otherwise every course of the
    -- program. A payment can carry both — the course is the narrower of the
    -- two and wins.
    if v_pay.loop_id is not null then
      insert into public.enrollments (student_id, loop_id, status, enrolled_by)
      values (v_pay.student_id, v_pay.loop_id, 'active', (select auth.uid()))
      on conflict (student_id, loop_id) do update set status = 'active';
    elsif v_pay.track_id is not null then
      insert into public.enrollments (student_id, loop_id, status, enrolled_by)
      select v_pay.student_id, l.id, 'active', (select auth.uid())
      from public.loops l
      where l.track_id = v_pay.track_id
      on conflict (student_id, loop_id) do update set status = 'active';
    end if;

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
-- The same function with one more thing it can buy. A course is named
-- instead of a program, priced off its own row, and opens only itself.
--
-- Dropped and recreated rather than replaced: a fourth parameter is a new
-- signature, and leaving the old one beside it would make every three-
-- argument call ambiguous.

drop function if exists public.pay_from_wallet(uuid, public.pay_plan, text);

create function public.pay_from_wallet(
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
    select l.price_egp, l.name, l.track_id, l.listed
      into v_content, v_name, v_track, v_listed
      from public.loops l where l.id = p_loop;
    if v_name is null then
      raise exception 'that course no longer exists' using errcode = 'P0002';
    end if;
    if not coalesce(v_listed, false) or v_content is null then
      raise exception 'that course is not on sale on its own' using errcode = '22023';
    end if;
  elsif p_track is not null then
    select coalesce(t.price_egp, 0), t.name, t.listed
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
