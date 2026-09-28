-- ==========================================================================
-- Buying a kit out of the family wallet.
--
-- A subscription is time and a program is content; a kit is a box that has
-- to reach a hero's hands. The money side is the one already built — the
-- wallet holds checked money, so spending it needs nobody to approve
-- anything — but the handing over does not exist in software, so the order
-- carries `fulfilled_at` and the admin ticks it when the kit is given out.
--
--   payments.kind = 'kit'   one kit, bought for one hero
--   payments.product_id     which listing it was
--   payments.fulfilled_at   when the admin handed it over; null = still owed
--
-- Stock is `products.seats_taken`, counted up here under the same lock that
-- takes the money, so two parents cannot buy the last one.
-- ==========================================================================

alter type public.pay_kind add value if not exists 'kit';

alter table public.payments
  add column if not exists product_id text references public.products (id) on delete set null,
  add column if not exists fulfilled_at timestamptz;

comment on column public.payments.product_id is
  'The marketplace listing this paid for. Kept beside program_name, which survives the listing.';
comment on column public.payments.fulfilled_at is
  'Kit orders only: when the admin handed it over. Null means it is still owed.';

create index if not exists payments_product_idx on public.payments (product_id);
create index if not exists payments_owed_idx on public.payments (fulfilled_at) where fulfilled_at is null;
