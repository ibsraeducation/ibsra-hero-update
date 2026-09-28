/* ==========================================================================
   Two holes the journey walks into, closed.

   1. Rejecting an approved payment. `approve_payment` refuses to run twice,
      but `reject_payment` would happily stamp an approved transfer as
      rejected — and the months it already added to the subscription stay
      added. A payment that was approved is finished; it is not rejectable.

   2. A student the admin created belongs to nobody. Only the family's own
      `add_child` ever wrote `guardians`, through the Edge Function's service
      key, so a student created on Admin → Students could never be paid for,
      asked for, or reported on by a parent. The admin may now link one to a
      family account, and unlink a link they made by mistake. A parent still
      cannot write the table at all — being someone's guardian is not a claim
      anybody makes about themselves.
   ========================================================================== */

/* ---------------- 1 · rejecting is for a payment that is not approved ----- */

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

  select * into v_pay from public.payments p where p.id = p_id for update;
  if v_pay.id is null then
    raise exception 'that payment is gone' using errcode = 'P0002';
  end if;
  if v_pay.status = 'approved' then
    raise exception 'that payment was approved already — it cannot be rejected'
      using errcode = '23505';
  end if;

  update public.payments p
     set status = 'rejected',
         review_note = left(coalesce(p_note, ''), 1000),
         reviewed_by = (select auth.uid()),
         reviewed_at = now()
   where p.id = p_id
  returning * into v_pay;

  return v_pay;
end
$$;

/* ---------------- 2 · the admin may link a student to a family ----------- */

create policy guardians_admin_insert on public.guardians
  for insert to authenticated
  with check ((select private.is_admin()));

create policy guardians_admin_delete on public.guardians
  for delete to authenticated
  using ((select private.is_admin()));
