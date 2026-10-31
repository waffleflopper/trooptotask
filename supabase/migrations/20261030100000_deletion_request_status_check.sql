BEGIN;

-- Validating on purpose: a saved status outside the four fails the migration
-- loudly instead of reaching the approvals UI.
ALTER TABLE public.deletion_requests
  ADD CONSTRAINT deletion_requests_status_check
  CHECK (status IN ('pending', 'approved', 'denied', 'cancelled'));

COMMIT;
