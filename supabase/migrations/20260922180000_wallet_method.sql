-- ==========================================================================
-- A fourth way to pay: the family's own wallet.
--
-- On its own because a new enum value cannot be used in the transaction
-- that adds it — the wallet itself is the migration after this one.
-- ==========================================================================

alter type public.pay_method add value if not exists 'wallet';
