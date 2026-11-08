-- #2059 An Organization invitation to an existing account notifies that account in every Organization it opens, so the
-- notification has no Organization. Account-level notifications are now feedback replies and received invitations.
BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT notifications_account_feedback_only;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_account_level_types
  CHECK (organization_id IS NOT NULL OR type IN ('feedback_reply', 'organization_invitation_received')) NOT VALID;
ALTER TABLE public.notifications VALIDATE CONSTRAINT notifications_account_level_types;

COMMIT;
