CREATE OR REPLACE FUNCTION "public"."get_effective_tier"("p_org_id" "uuid") RETURNS "jsonb"
LANGUAGE "plpgsql"
SECURITY DEFINER
SET "search_path" = "public"
AS $$
DECLARE
	v_org record;
	v_snapshot record;
	v_tier text;
	v_source text;
	v_personnel_count integer;
	v_cap integer;
	v_is_read_only boolean := false;
	v_read_only_reason text := NULL;
	v_gift_active boolean := false;
	v_had_non_entitling_billing_state boolean := false;
	BEGIN
		IF current_setting('role', true) <> 'service_role'
			AND NOT "public"."is_platform_admin"()
			AND NOT "public"."is_org_member"("p_org_id") THEN
			RETURN jsonb_build_object('error', 'forbidden');
		END IF;

		SELECT * INTO v_org FROM "public"."organizations" WHERE "id" = "p_org_id";

	IF NOT FOUND THEN
		RETURN jsonb_build_object('error', 'org_not_found');
	END IF;

	SELECT *
	INTO v_snapshot
	FROM "public"."organization_billing_snapshots"
	WHERE "organization_id" = "p_org_id";

	v_tier := 'free';
	v_source := 'default';

	IF v_snapshot."organization_id" IS NOT NULL AND v_snapshot."source" = 'stripe' THEN
		IF v_snapshot."subscription_status" = ANY (ARRAY['active'::text, 'trialing'::text, 'paused'::text]) THEN
			v_tier := v_snapshot."commercial_plan";
			v_source := 'subscription';
		ELSIF v_snapshot."subscription_status" = 'past_due' THEN
			v_tier := v_snapshot."commercial_plan";
			v_source := 'subscription';
			v_is_read_only := true;
			v_read_only_reason := 'payment_failure';
		ELSIF v_snapshot."subscription_status" = ANY (
			ARRAY['unpaid'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text]
		) THEN
			v_had_non_entitling_billing_state := true;
		END IF;
	ELSIF v_org."stripe_subscription_id" IS NOT NULL
		AND v_org."subscription_status" = 'active'
		AND v_org."tier" != 'free' THEN
		v_tier := v_org."tier";
		v_source := 'subscription';
	ELSIF v_org."stripe_subscription_id" IS NOT NULL
		AND v_org."subscription_status" = 'past_due'
		AND v_org."tier" != 'free' THEN
		v_tier := v_org."tier";
		v_source := 'subscription';
		v_is_read_only := true;
		v_read_only_reason := 'payment_failure';
	ELSIF v_org."stripe_subscription_id" IS NOT NULL
		AND v_org."subscription_status" = ANY (
			ARRAY['unpaid'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text]
		) THEN
		v_had_non_entitling_billing_state := true;
	END IF;

	v_gift_active := v_org."gift_tier" IS NOT NULL AND v_org."gift_expires_at" > now();
	IF v_gift_active THEN
		IF (CASE v_org."gift_tier" WHEN 'unit' THEN 3 WHEN 'team' THEN 2 ELSE 1 END)
			>= (CASE v_tier WHEN 'unit' THEN 3 WHEN 'team' THEN 2 ELSE 1 END) THEN
			v_tier := v_org."gift_tier";
			v_source := 'gift';
		END IF;

		v_is_read_only := false;
		v_read_only_reason := NULL;
	END IF;

	SELECT count(*) INTO v_personnel_count
	FROM "public"."personnel"
	WHERE "organization_id" = "p_org_id"
		AND "archived_at" IS NULL;

	v_cap := CASE v_tier
		WHEN 'free' THEN 20
		WHEN 'team' THEN 80
		WHEN 'unit' THEN greatest(500, v_personnel_count)
		ELSE 20
	END;

	IF v_personnel_count > v_cap THEN
		v_is_read_only := true;
		v_read_only_reason := CASE
			WHEN v_had_non_entitling_billing_state THEN 'billing_state'
			ELSE COALESCE(v_read_only_reason, 'personnel_limit')
		END;
	END IF;

	RETURN jsonb_build_object(
		'tier', v_tier,
		'source', v_source,
		'personnelCount', v_personnel_count,
		'personnelCap', v_cap,
		'isReadOnly', v_is_read_only,
		'readOnlyReason', v_read_only_reason,
		'giftExpiresAt', v_org."gift_expires_at",
		'giftTier', v_org."gift_tier"
	);
	END;
	$$;

REVOKE ALL ON FUNCTION "public"."get_effective_tier"("p_org_id" "uuid") FROM "anon";
REVOKE ALL ON FUNCTION "public"."get_effective_tier"("p_org_id" "uuid") FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_effective_tier"("p_org_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_effective_tier"("p_org_id" "uuid") TO "service_role";
