-- ==========================================================================
-- `buy_kit_from_wallet` — one kit, for one hero, out of money already on the
-- account.
--
-- Its own function rather than a branch of `pay_from_wallet`, because the
-- two buy different things: that one buys months and opens courses, this one
-- takes a box off the shelf. What they share is the rule that matters — the
-- price is read from the server's own table, never from the browser, and the
-- balance is checked in the same statement that takes it.
--
-- A kit is bought for a hero on the account: the record says who it is for,
-- so the admin knows whose hands it goes into.
-- ==========================================================================

create or replace function public.buy_kit_from_wallet(
  p_product text,
  p_student uuid
)
returns public.payments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent  uuid := (select auth.uid());
  v_prod    public.products;
  v_balance integer;
  v_pay     public.payments;
begin
  if not private.is_parent() then
    raise exception 'only a parent buys from a wallet' using errcode = '42501';
  end if;
  if p_student not in (select private.my_children()) then
    raise exception 'that hero is not on your account' using errcode = '42501';
  end if;

  -- Locked for the whole transaction: the stock check below and the count-up
  -- that follows it have to be the same decision.
  select * into v_prod from public.products p where p.id = p_product for update;

  if v_prod.id is null or v_prod.status <> 'published' then
    raise exception 'that kit is not on sale' using errcode = 'P0002';
  end if;
  if v_prod.category <> 'kit' then
    raise exception 'that listing is not a kit' using errcode = '22023';
  end if;
  if v_prod.price_egp is null or v_prod.price_egp <= 0 then
    raise exception 'that kit has no price yet — ask the admin' using errcode = '22023';
  end if;
  if v_prod.seats_taken >= v_prod.seats then
    raise exception 'that kit is out of stock' using errcode = '22003';
  end if;

  -- take it out of the wallet, or say what is missing
  update public.wallets w
     set balance_egp = w.balance_egp - v_prod.price_egp
   where w.parent_id = v_parent
     and w.balance_egp >= v_prod.price_egp
  returning w.balance_egp into v_balance;

  if v_balance is null then
    raise exception 'there is not enough in the wallet — charge it first' using errcode = '22003';
  end if;

  update public.products p
     set seats_taken = p.seats_taken + 1
   where p.id = p_product;

  -- the record of it, approved the moment it is made: the money was checked
  -- when it went into the wallet, so there is nothing left to review
  insert into public.payments (
    parent_id, student_id, product_id, program_name, kind, amount_egp,
    method, sender_ref, status, review_note, reviewed_by, reviewed_at
  ) values (
    v_parent, p_student, v_prod.id, v_prod.name, 'kit', v_prod.price_egp,
    'wallet', 'Family wallet', 'approved', 'Bought from the family wallet', v_parent, now()
  )
  returning * into v_pay;

  insert into public.wallet_entries
    (parent_id, move, amount_egp, balance_after, payment_id, student_id, note)
  values
    (v_parent, 'spend', v_prod.price_egp, v_balance, v_pay.id, p_student, v_prod.name);

  return v_pay;
end
$$;

revoke all on function public.buy_kit_from_wallet(text, uuid) from public, anon;
grant execute on function public.buy_kit_from_wallet(text, uuid) to authenticated;
