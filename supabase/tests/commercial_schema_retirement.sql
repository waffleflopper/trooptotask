-- Retirement is an externally visible database boundary: the old commercial
-- relations/fields and callable RPCs must no longer exist for any role.
-- Retained provisioning, privileges, invitation transitions and RLS are covered
-- by their existing behavioral suites, not duplicated here.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(3);

SELECT is_empty(
  $$SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (
      'organization_billing_snapshots', 'stripe_webhook_events',
      'organization_checkout_attempts', 'organization_plan_feature_overrides')$$,
  'commercial relations are absent'
);
SELECT is_empty(
  $$SELECT a.attname FROM pg_attribute a
    WHERE a.attrelid='public.organizations'::regclass AND NOT a.attisdropped
      AND a.attname IN ('tier', 'stripe_customer_id', 'stripe_subscription_id',
        'subscription_status', 'current_period_end', 'gift_tier',
        'gift_expires_at', 'gifted_by')$$,
  'Organization commercial fields are absent'
);
SELECT is_empty(
  $$SELECT p.oid::regprocedure FROM pg_proc p
    WHERE p.pronamespace='public'::regnamespace AND p.proname IN (
      'cleanup_old_webhook_events', 'get_effective_tier',
      'record_stripe_webhook_event_attempt', 'record_retryable_stripe_webhook_event_attempt',
      'upsert_organization_billing_snapshot_if_current',
      'upsert_organization_billing_snapshot_and_mirror_if_current',
      'block_invitation_if_member_cap_exceeded', 'list_platform_organization_tier_counts')$$,
  'commercial RPCs, including anonymous ledger writers and every overload, are absent'
);
SELECT * FROM finish();
ROLLBACK;
