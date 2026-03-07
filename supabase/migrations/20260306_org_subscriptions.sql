-- New org-based subscription system

-- Add subscription fields to organizations table
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'team', 'unit')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'paused')),
  ADD COLUMN IF NOT EXISTS current_period_end timestamptz,
  ADD COLUMN IF NOT EXISTS gift_tier text
    CHECK (gift_tier IS NULL OR gift_tier IN ('team', 'unit')),
  ADD COLUMN IF NOT EXISTS gift_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS gifted_by uuid REFERENCES auth.users(id);

-- Data exports tracking (rate-limited on free tier)
CREATE TABLE IF NOT EXISTS data_exports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  file_path text,
  file_size_bytes bigint,
  created_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

-- Index for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_data_exports_org_created
  ON data_exports(org_id, created_at DESC);

-- Stripe webhook events (recreate for new system)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id text PRIMARY KEY,
  type text NOT NULL,
  data jsonb NOT NULL,
  processed boolean DEFAULT false NOT NULL,
  processed_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- RLS policies
ALTER TABLE data_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's exports
CREATE POLICY "Org members can read exports"
  ON data_exports FOR SELECT
  USING (org_id IN (
    SELECT organization_id FROM organization_memberships WHERE user_id = auth.uid()
  ));

-- Only org owner can create exports
CREATE POLICY "Org owner can create exports"
  ON data_exports FOR INSERT
  WITH CHECK (org_id IN (
    SELECT id FROM organizations WHERE created_by = auth.uid()
  ));

-- Webhook events: service role only (no user access)
CREATE POLICY "Service role only for webhooks"
  ON stripe_webhook_events FOR ALL
  USING (false);

-- Function: get effective tier for an org
CREATE OR REPLACE FUNCTION get_effective_tier(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
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

  -- Get personnel count
  SELECT count(*) INTO v_personnel_count
  FROM personnel WHERE organization_id = p_org_id;

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
