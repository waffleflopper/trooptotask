-- Stripe may add cancellation_details.feedback values without notice. Store
-- provider feedback as text so webhooks continue processing for future values.
ALTER TABLE "public"."organization_billing_snapshots"
	DROP CONSTRAINT IF EXISTS "organization_billing_snapshots_cancellation_feedback_check";
