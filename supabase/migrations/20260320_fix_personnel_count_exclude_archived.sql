-- Fix: count_org_personnel and get_effective_tier were counting archived personnel toward the cap.
-- Both functions now exclude archived personnel (archived_at IS NULL).

-- Fix count_org_personnel
CREATE OR REPLACE FUNCTION "public"."count_org_personnel"("p_org_id" "uuid") RETURNS integer
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT COUNT(*)::integer
  FROM public.personnel
  WHERE organization_id = p_org_id
    AND archived_at IS NULL;
$$;

-- Fix get_effective_tier: update the personnel count query
CREATE OR REPLACE FUNCTION "public"."get_effective_tier"("p_org_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_org record;
  v_tier text;
  v_source text;
  v_personnel_count integer;
  v_cap integer;
  v_is_read_only boolean;
BEGIN
  SELECT * INTO v_org FROM organizations WHERE id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'org_not_found');
  END IF;

  -- Priority: active Stripe > active gift > free
  IF v_org.stripe_subscription_id IS NOT NULL
     AND v_org.subscription_status = 'active'
     AND v_org.tier != 'free' THEN
    -- Check if gift overrides (gift >= sub tier)
    IF v_org.gift_tier IS NOT NULL
       AND v_org.gift_expires_at > now() THEN
      -- Compare tiers: unit > team > free
      IF (CASE v_org.gift_tier WHEN 'unit' THEN 3 WHEN 'team' THEN 2 ELSE 1 END)
         >= (CASE v_org.tier WHEN 'unit' THEN 3 WHEN 'team' THEN 2 ELSE 1 END) THEN
        v_tier := v_org.gift_tier;
        v_source := 'gift';
      ELSE
        v_tier := v_org.tier;
        v_source := 'subscription';
      END IF;
    ELSE
      v_tier := v_org.tier;
      v_source := 'subscription';
    END IF;
  ELSIF v_org.gift_tier IS NOT NULL
        AND v_org.gift_expires_at > now() THEN
    v_tier := v_org.gift_tier;
    v_source := 'gift';
  ELSE
    v_tier := 'free';
    v_source := 'default';
  END IF;

  -- Get personnel count (exclude archived)
  SELECT count(*) INTO v_personnel_count
  FROM personnel
  WHERE organization_id = p_org_id
    AND archived_at IS NULL;

  -- Determine cap
  v_cap := CASE v_tier
    WHEN 'free' THEN 15
    WHEN 'team' THEN 80
    WHEN 'unit' THEN 999999
    ELSE 15
  END;

  v_is_read_only := v_personnel_count > v_cap;

  RETURN jsonb_build_object(
    'tier', v_tier,
    'source', v_source,
    'personnelCount', v_personnel_count,
    'personnelCap', v_cap,
    'isReadOnly', v_is_read_only,
    'giftExpiresAt', v_org.gift_expires_at,
    'giftTier', v_org.gift_tier
  );
END;
$$;
