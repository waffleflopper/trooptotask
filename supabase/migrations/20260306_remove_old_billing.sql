-- Remove old user-based billing system
-- Replacing with org-based, personnel-capped subscription model
-- KEEPS: platform_admins table, is_platform_admin() function, is_super_admin() function

-- ============================================================
-- 1. Drop RLS policies on tables we're removing
-- ============================================================

-- user_subscriptions policies
DROP POLICY IF EXISTS "Users can read their own subscription" ON user_subscriptions;
DROP POLICY IF EXISTS "System can insert subscriptions" ON user_subscriptions;
DROP POLICY IF EXISTS "System can update subscriptions" ON user_subscriptions;

-- subscription_plans policies
DROP POLICY IF EXISTS "Anyone can read active subscription plans" ON subscription_plans;

-- payment_history policies
DROP POLICY IF EXISTS "Users can read their own payment history" ON payment_history;
DROP POLICY IF EXISTS "System can insert payment history" ON payment_history;

-- stripe_webhook_events policies
DROP POLICY IF EXISTS "Only admins can read webhook events" ON stripe_webhook_events;
DROP POLICY IF EXISTS "System can insert webhook events" ON stripe_webhook_events;
DROP POLICY IF EXISTS "System can update webhook events" ON stripe_webhook_events;

-- admin_audit_log policies
DROP POLICY IF EXISTS "Admins can insert audit log" ON admin_audit_log;
DROP POLICY IF EXISTS "Admins can read audit log" ON admin_audit_log;

-- ============================================================
-- 2. Drop triggers
-- ============================================================

-- Trigger that auto-creates a user_subscription on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Trigger that updates updated_at on user_subscriptions
DROP TRIGGER IF EXISTS user_subscriptions_updated_at ON user_subscriptions;

-- ============================================================
-- 3. Drop functions that reference removed tables
-- ============================================================

-- Trigger function for creating default subscription
DROP FUNCTION IF EXISTS create_default_subscription();

-- RPC functions for old billing
DROP FUNCTION IF EXISTS get_user_subscription(uuid);
DROP FUNCTION IF EXISTS grant_subscription(uuid, text, integer, integer, integer);
DROP FUNCTION IF EXISTS extend_user_trial(uuid, integer);
DROP FUNCTION IF EXISTS update_admin_notes(uuid, text);
DROP FUNCTION IF EXISTS log_admin_action(uuid, text, jsonb);

-- Functions that depend on get_user_subscription (old billing limits)
DROP FUNCTION IF EXISTS can_add_personnel(uuid, uuid);
DROP FUNCTION IF EXISTS can_create_organization(uuid);
DROP FUNCTION IF EXISTS count_user_organizations(uuid);

-- ============================================================
-- 4. Drop tables (order matters for foreign keys)
-- ============================================================

-- payment_history references user_subscriptions, so drop first
DROP TABLE IF EXISTS payment_history;
DROP TABLE IF EXISTS stripe_webhook_events;
DROP TABLE IF EXISTS admin_audit_log;
DROP TABLE IF EXISTS user_subscriptions;
DROP TABLE IF EXISTS subscription_plans;

-- NOTE: platform_admins table is KEPT — reused for admin gifting in new system
-- NOTE: is_platform_admin() function is KEPT — reused for admin gifting in new system
-- NOTE: is_super_admin() function is KEPT — reused for admin gifting in new system
