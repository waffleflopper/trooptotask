-- Migration: Add subscription and monetization system
-- Date: 2026-02-14
-- Description: Adds subscription plans, user subscriptions, payment history,
--              Stripe webhook events, platform admins, and audit logging

-- ============================================================
-- STEP 1: Create all tables first (no RLS yet)
-- ============================================================

-- Subscription Plans (static reference data)
CREATE TABLE public.subscription_plans (
  id text PRIMARY KEY,  -- 'free', 'pro', 'team'
  name text NOT NULL,
  description text,
  max_organizations integer,      -- null = unlimited
  max_personnel_per_org integer,  -- null = unlimited
  has_duty_roster boolean NOT NULL DEFAULT false,
  has_bulk_import boolean NOT NULL DEFAULT false,
  has_excel_export boolean NOT NULL DEFAULT false,
  has_priority_support boolean NOT NULL DEFAULT false,
  price_monthly integer NOT NULL DEFAULT 0,  -- cents
  price_quarterly integer NOT NULL DEFAULT 0,
  price_semiannual integer NOT NULL DEFAULT 0,
  stripe_product_id text,
  stripe_price_monthly_id text,
  stripe_price_quarterly_id text,
  stripe_price_semiannual_id text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed subscription plans
INSERT INTO public.subscription_plans (id, name, description, max_organizations, max_personnel_per_org, has_duty_roster, has_bulk_import, has_excel_export, has_priority_support, price_monthly, price_quarterly, price_semiannual, is_active, sort_order) VALUES
  ('free', 'Free', 'Basic features for getting started', 1, 25, false, false, false, false, 0, 0, 0, true, 0),
  ('pro', 'Pro', 'Full features for small units', 3, 100, true, true, true, false, 999, 1999, 4499, true, 1),
  ('team', 'Team', 'Unlimited everything for large units', null, null, true, true, true, true, 3999, 9999, 15999, true, 2);

-- User Subscriptions
CREATE TABLE public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan_id text NOT NULL REFERENCES public.subscription_plans(id) DEFAULT 'free',
  billing_cycle text NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'semiannual')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'trialing', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  canceled_at timestamptz,
  override_max_orgs integer,       -- admin override
  override_max_personnel integer,  -- admin override
  override_expiry timestamptz,     -- when override expires
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for user_subscriptions
CREATE INDEX idx_user_subscriptions_user_id ON public.user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_stripe_customer_id ON public.user_subscriptions(stripe_customer_id);
CREATE INDEX idx_user_subscriptions_stripe_subscription_id ON public.user_subscriptions(stripe_subscription_id);
CREATE INDEX idx_user_subscriptions_status ON public.user_subscriptions(status);

-- Payment History
CREATE TABLE public.payment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.user_subscriptions(id),
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  amount integer NOT NULL,  -- cents
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL CHECK (status IN ('succeeded', 'failed', 'refunded', 'pending')),
  description text,
  receipt_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for payment_history
CREATE INDEX idx_payment_history_user_id ON public.payment_history(user_id);
CREATE INDEX idx_payment_history_subscription_id ON public.payment_history(subscription_id);
CREATE INDEX idx_payment_history_stripe_invoice_id ON public.payment_history(stripe_invoice_id);
CREATE INDEX idx_payment_history_created_at ON public.payment_history(created_at DESC);

-- Stripe Webhook Events (idempotency tracking)
CREATE TABLE public.stripe_webhook_events (
  id text PRIMARY KEY,  -- Stripe event ID
  type text NOT NULL,
  data jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for finding unprocessed events
CREATE INDEX idx_stripe_webhook_events_processed ON public.stripe_webhook_events(processed) WHERE processed = false;
CREATE INDEX idx_stripe_webhook_events_created_at ON public.stripe_webhook_events(created_at DESC);

-- Platform Admins
CREATE TABLE public.platform_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role text NOT NULL DEFAULT 'support' CHECK (role IN ('super_admin', 'support', 'billing')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for platform_admins
CREATE INDEX idx_platform_admins_user_id ON public.platform_admins(user_id);

-- Admin Audit Log
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id),
  target_user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for admin_audit_log
CREATE INDEX idx_admin_audit_log_admin_user_id ON public.admin_audit_log(admin_user_id);
CREATE INDEX idx_admin_audit_log_target_user_id ON public.admin_audit_log(target_user_id);
CREATE INDEX idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);
CREATE INDEX idx_admin_audit_log_action ON public.admin_audit_log(action);

-- ============================================================
-- STEP 2: Create helper functions (before RLS policies)
-- ============================================================

-- Check if current user is a platform admin
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid() AND is_active = true
  );
$$;

-- Check if current user is a super admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid() AND is_active = true AND role = 'super_admin'
  );
$$;

-- ============================================================
-- STEP 3: Enable RLS and create policies (after functions exist)
-- ============================================================

-- RLS for subscription_plans (public read)
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active subscription plans"
  ON public.subscription_plans FOR SELECT
  USING (is_active = true);

-- RLS for user_subscriptions
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own subscription"
  ON public.user_subscriptions FOR SELECT
  USING (auth.uid() = user_id OR public.is_platform_admin());

CREATE POLICY "System can insert subscriptions"
  ON public.user_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.is_platform_admin());

CREATE POLICY "System can update subscriptions"
  ON public.user_subscriptions FOR UPDATE
  USING (auth.uid() = user_id OR public.is_platform_admin());

-- RLS for payment_history
ALTER TABLE public.payment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own payment history"
  ON public.payment_history FOR SELECT
  USING (auth.uid() = user_id OR public.is_platform_admin());

CREATE POLICY "System can insert payment history"
  ON public.payment_history FOR INSERT
  WITH CHECK (public.is_platform_admin() OR auth.uid() = user_id);

-- RLS for stripe_webhook_events (admin only + system insert/update)
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can read webhook events"
  ON public.stripe_webhook_events FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "System can insert webhook events"
  ON public.stripe_webhook_events FOR INSERT
  WITH CHECK (true);  -- Webhook handler needs to insert

CREATE POLICY "System can update webhook events"
  ON public.stripe_webhook_events FOR UPDATE
  USING (true);  -- Webhook handler needs to update

-- RLS for platform_admins
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read platform_admins"
  ON public.platform_admins FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "Super admins can manage platform_admins"
  ON public.platform_admins FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.platform_admins
      WHERE user_id = auth.uid() AND is_active = true AND role = 'super_admin'
    )
  );

-- RLS for admin_audit_log
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit log"
  ON public.admin_audit_log FOR SELECT
  USING (public.is_platform_admin());

CREATE POLICY "Admins can insert audit log"
  ON public.admin_audit_log FOR INSERT
  WITH CHECK (public.is_platform_admin());

-- ============================================================
-- STEP 4: Create remaining functions and triggers
-- ============================================================

-- Auto-create subscription for new users
CREATE OR REPLACE FUNCTION public.create_default_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_subscriptions (user_id, plan_id, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_subscription();

-- Get user's subscription with plan details
CREATE OR REPLACE FUNCTION public.get_user_subscription(p_user_id uuid DEFAULT auth.uid())
RETURNS TABLE (
  subscription_id uuid,
  plan_id text,
  plan_name text,
  billing_cycle text,
  status text,
  max_organizations integer,
  max_personnel_per_org integer,
  has_duty_roster boolean,
  has_bulk_import boolean,
  has_excel_export boolean,
  has_priority_support boolean,
  override_max_orgs integer,
  override_max_personnel integer,
  override_expiry timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz
) LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT
    us.id as subscription_id,
    us.plan_id,
    sp.name as plan_name,
    us.billing_cycle,
    us.status,
    COALESCE(
      CASE WHEN us.override_expiry IS NULL OR us.override_expiry > now() THEN us.override_max_orgs END,
      sp.max_organizations
    ) as max_organizations,
    COALESCE(
      CASE WHEN us.override_expiry IS NULL OR us.override_expiry > now() THEN us.override_max_personnel END,
      sp.max_personnel_per_org
    ) as max_personnel_per_org,
    sp.has_duty_roster,
    sp.has_bulk_import,
    sp.has_excel_export,
    sp.has_priority_support,
    us.override_max_orgs,
    us.override_max_personnel,
    us.override_expiry,
    us.current_period_end,
    us.trial_end
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.user_id = p_user_id;
$$;

-- Count user's organizations
CREATE OR REPLACE FUNCTION public.count_user_organizations(p_user_id uuid DEFAULT auth.uid())
RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COUNT(*)::integer
  FROM public.organization_memberships
  WHERE user_id = p_user_id AND role = 'owner';
$$;

-- Count personnel in an organization
CREATE OR REPLACE FUNCTION public.count_org_personnel(p_org_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COUNT(*)::integer
  FROM public.personnel
  WHERE organization_id = p_org_id;
$$;

-- Check if user can create a new organization
CREATE OR REPLACE FUNCTION public.can_create_organization(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_max_orgs integer;
  v_current_orgs integer;
BEGIN
  SELECT max_organizations INTO v_max_orgs
  FROM public.get_user_subscription(p_user_id);

  -- null means unlimited
  IF v_max_orgs IS NULL THEN
    RETURN true;
  END IF;

  SELECT public.count_user_organizations(p_user_id) INTO v_current_orgs;

  RETURN v_current_orgs < v_max_orgs;
END;
$$;

-- Check if user can add personnel to an organization
CREATE OR REPLACE FUNCTION public.can_add_personnel(p_org_id uuid, p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
DECLARE
  v_max_personnel integer;
  v_current_personnel integer;
BEGIN
  SELECT max_personnel_per_org INTO v_max_personnel
  FROM public.get_user_subscription(p_user_id);

  -- null means unlimited
  IF v_max_personnel IS NULL THEN
    RETURN true;
  END IF;

  SELECT public.count_org_personnel(p_org_id) INTO v_current_personnel;

  RETURN v_current_personnel < v_max_personnel;
END;
$$;

-- Log admin action
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_target_user_id uuid,
  p_action text,
  p_details jsonb DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_log_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can log admin actions';
  END IF;

  INSERT INTO public.admin_audit_log (admin_user_id, target_user_id, action, details)
  VALUES (auth.uid(), p_target_user_id, p_action, p_details)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$;

-- Extend user's trial
CREATE OR REPLACE FUNCTION public.extend_user_trial(
  p_user_id uuid,
  p_days integer
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can extend trials';
  END IF;

  UPDATE public.user_subscriptions
  SET
    trial_end = COALESCE(trial_end, now()) + (p_days || ' days')::interval,
    status = 'trialing',
    updated_at = now()
  WHERE user_id = p_user_id;

  PERFORM public.log_admin_action(
    p_user_id,
    'extend_trial',
    jsonb_build_object('days', p_days)
  );
END;
$$;

-- Grant subscription to user (admin override)
CREATE OR REPLACE FUNCTION public.grant_subscription(
  p_user_id uuid,
  p_plan_id text,
  p_duration_days integer,
  p_max_orgs integer DEFAULT NULL,
  p_max_personnel integer DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can grant subscriptions';
  END IF;

  UPDATE public.user_subscriptions
  SET
    plan_id = p_plan_id,
    status = 'active',
    override_max_orgs = p_max_orgs,
    override_max_personnel = p_max_personnel,
    override_expiry = CASE WHEN p_duration_days IS NOT NULL THEN now() + (p_duration_days || ' days')::interval ELSE NULL END,
    updated_at = now()
  WHERE user_id = p_user_id;

  PERFORM public.log_admin_action(
    p_user_id,
    'grant_subscription',
    jsonb_build_object(
      'plan_id', p_plan_id,
      'duration_days', p_duration_days,
      'max_orgs', p_max_orgs,
      'max_personnel', p_max_personnel
    )
  );
END;
$$;

-- Update admin notes for a user
CREATE OR REPLACE FUNCTION public.update_admin_notes(
  p_user_id uuid,
  p_notes text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Only platform admins can update admin notes';
  END IF;

  UPDATE public.user_subscriptions
  SET admin_notes = p_notes, updated_at = now()
  WHERE user_id = p_user_id;

  PERFORM public.log_admin_action(
    p_user_id,
    'update_notes',
    jsonb_build_object('notes', p_notes)
  );
END;
$$;

-- Updated at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
