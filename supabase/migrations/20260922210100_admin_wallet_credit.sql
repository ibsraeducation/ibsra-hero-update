-- ==========================================================================
-- The admin puts money on a family wallet.
--
-- The wallet already had one way in: the family files a transfer and the
-- admin approves it (`approve_payment`). That is the right path when a
-- family sends money themselves, and it stays exactly as it was.
--
-- This is the other case — the admin is the one holding the money, or owes
-- it: cash handed over at the centre, a transfer that arrived without anyone
-- filing it, a correction, a goodwill credit. There is nothing to approve,
-- because the person approving is the person adding.
--
-- It writes the same three rows an approved top-up writes, so the family's
-- wallet page and the admin's payments list read it like any other credit:
--
--   payments        one approved 'topup', method 'admin', for the record
--   wallets         the balance, created on the first credit
--   wallet_entries  the movement, carrying the balance it left behind
-- ==========================================================================

create or replace function public.admin_credit_wallet(
  p_parent uuid,
  p_amount integer,
  p_note   text default null
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    public.app_role;
  v_reason  text := nullif(btrim(coalesce(p_note, '')), '');
  v_balance integer;
  v_pay     public.payments;
begin
  if not private.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;

  -- The table's own check would catch this, but not with a sentence anybody
  -- wants to read.
  if p_amount is null or p_amount <= 0 or p_amount > 10000000 then
    raise exception 'the amount has to be between 1 and 10,000,000 EGP' using errcode = '22023';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_parent;
  if v_role is null then
    raise exception 'that account is gone' using errcode = 'P0002';
  end if;
  if v_role <> 'parent' then
    raise exception 'only a family account has a wallet' using errcode = '22023';
  end if;

  insert into public.payments (
    parent_id, student_id, track_id, program_name, kind, plan, amount_egp,
    method, sender_ref, status, note, review_note, reviewed_by, reviewed_at
  ) values (
    p_parent, null, null, 'Wallet top-up', 'topup', null, p_amount,
    'admin', 'Added by the admin', 'approved', null,
    left(coalesce(v_reason, 'Added straight to the wallet'), 1000),
    (select auth.uid()), now()
  )
  returning * into v_pay;

  insert into public.wallets (parent_id, balance_egp)
  values (p_parent, p_amount)
  on conflict (parent_id) do update
    set balance_egp = public.wallets.balance_egp + excluded.balance_egp
  returning balance_egp into v_balance;

  insert into public.wallet_entries (parent_id, move, amount_egp, balance_after, payment_id, note)
  values (p_parent, 'topup', p_amount, v_balance, v_pay.id,
          left(coalesce(v_reason, 'Added by the admin'), 300));

  return v_pay;
end
$$;
revoke all on function public.admin_credit_wallet(uuid, integer, text) from public, anon;
grant execute on function public.admin_credit_wallet(uuid, integer, text) to authenticated;

comment on function public.admin_credit_wallet(uuid, integer, text) is
  'Admin only. Credits a family wallet directly and files the approved topup that records it.';
