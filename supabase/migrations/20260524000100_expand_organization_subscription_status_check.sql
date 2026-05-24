ALTER TABLE "public"."organizations"
	DROP CONSTRAINT IF EXISTS "organizations_subscription_status_check";

ALTER TABLE "public"."organizations"
	ADD CONSTRAINT "organizations_subscription_status_check"
	CHECK (
		"subscription_status" IS NULL
		OR "subscription_status" = ANY (
			ARRAY[
				'active'::text,
				'trialing'::text,
				'past_due'::text,
				'unpaid'::text,
				'canceled'::text,
				'incomplete'::text,
				'incomplete_expired'::text,
				'paused'::text
			]
		)
	);
