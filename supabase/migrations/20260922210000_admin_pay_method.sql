-- ==========================================================================
-- A fifth way money lands: the admin puts it there.
--
-- Until now every credit on a family wallet came from a transfer the family
-- filed themselves. An admin can now add to a wallet directly — money handed
-- over in person, a correction, a refund of something that never ran — and
-- that is not InstaPay, not Vodafone Cash, and not the wallet paying itself.
--
-- On its own because a new enum value cannot be used in the transaction that
-- adds it; the function that writes it is the migration after this one.
-- ==========================================================================

alter type public.pay_method add value if not exists 'admin';
