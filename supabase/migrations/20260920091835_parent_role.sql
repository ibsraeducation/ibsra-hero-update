-- ==========================================================================
-- The third role: parent.
--
-- A parent is the only account that signs itself up. It owns nothing on its
-- own: it adds its children, and a child reaches a course only after the
-- admin has approved the transfer the parent sent (see parent_payments).
--
-- On its own because a new enum value cannot be used in the transaction
-- that adds it.
-- ==========================================================================

alter type public.app_role add value if not exists 'parent';
