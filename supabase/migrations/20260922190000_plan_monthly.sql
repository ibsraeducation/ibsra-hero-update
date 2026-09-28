-- ==========================================================================
-- A fourth package: monthly.
--
-- On its own because a new enum value cannot be used in the transaction
-- that adds it — the price column and the arithmetic are the migration
-- after this one.
-- ==========================================================================

alter type public.pay_plan add value if not exists 'monthly' before 'quarterly';
