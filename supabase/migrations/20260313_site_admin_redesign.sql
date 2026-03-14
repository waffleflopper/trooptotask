-- Site Admin Panel Redesign Migration
-- Tables: user_suspensions, platform_announcements, announcement_dismissals
-- Columns: organizations.suspended_at
-- Functions: is_user_suspended, count_platform_users, daily_signups_last_30_days, search_users_by_email

-- =============================================================
-- 1. User Suspensions
-- =============================================================
CREATE TABLE user_suspensions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  suspended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  suspended_by UUID NOT NULL REFERENCES auth.users(id),
  reason TEXT
);

ALTER TABLE user_suspensions ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read/write suspensions
CREATE POLICY "Platform admins can manage suspensions"
  ON user_suspensions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

-- RPC: Check if a user is suspended (SECURITY DEFINER for hooks.server.ts)
CREATE OR REPLACE FUNCTION is_user_suspended(check_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_suspensions WHERE user_id = check_user_id
  );
$$;

-- =============================================================
-- 2. Organization Suspension
-- =============================================================
ALTER TABLE organizations ADD COLUMN suspended_at TIMESTAMPTZ;

-- =============================================================
-- 3. Platform Announcements
-- =============================================================
CREATE TYPE announcement_type AS ENUM ('info', 'warning', 'maintenance');

CREATE TABLE platform_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type announcement_type NOT NULL DEFAULT 'info',
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_announcements ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for banner display)
CREATE POLICY "Authenticated users can read announcements"
  ON platform_announcements
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only platform admins can write
CREATE POLICY "Platform admins can manage announcements"
  ON platform_announcements
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

CREATE TABLE announcement_dismissals (
  announcement_id UUID NOT NULL REFERENCES platform_announcements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

ALTER TABLE announcement_dismissals ENABLE ROW LEVEL SECURITY;

-- Users can manage their own dismissals only
CREATE POLICY "Users can manage own dismissals"
  ON announcement_dismissals
  FOR ALL
  USING (auth.uid() = user_id);

-- =============================================================
-- 4. Dashboard RPC Functions
-- =============================================================

-- Count platform users (avoids listUsers API pagination ceiling)
CREATE OR REPLACE FUNCTION count_platform_users()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_build_object(
    'total', (SELECT count(*) FROM auth.users),
    'last_30_days', (
      SELECT count(*) FROM auth.users
      WHERE created_at >= now() - interval '30 days'
    ),
    'previous_30_days', (
      SELECT count(*) FROM auth.users
      WHERE created_at >= now() - interval '60 days'
      AND created_at < now() - interval '30 days'
    )
  );
$$;

-- Daily signups for trend chart
CREATE OR REPLACE FUNCTION daily_signups_last_30_days()
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT json_agg(row_to_json(d))
  FROM (
    SELECT
      date_trunc('day', created_at)::date AS date,
      count(*) AS count
    FROM auth.users
    WHERE created_at >= now() - interval '30 days'
    GROUP BY date_trunc('day', created_at)::date
    ORDER BY date
  ) d;
$$;

-- =============================================================
-- 5. Search RPC (avoids listUsers API pagination ceiling)
-- =============================================================

-- Search users by email (platform admin only)
CREATE OR REPLACE FUNCTION search_users_by_email(search_query TEXT, max_results INT DEFAULT 5)
RETURNS JSON
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(json_agg(row_to_json(u)), '[]'::json)
  FROM (
    SELECT id, email, created_at, last_sign_in_at
    FROM auth.users
    WHERE email ILIKE '%' || search_query || '%'
    ORDER BY created_at DESC
    LIMIT max_results
  ) u;
$$;

-- =============================================================
-- 6. Indexes
-- =============================================================
CREATE INDEX idx_platform_announcements_active
  ON platform_announcements (is_active, expires_at)
  WHERE is_active = true;

CREATE INDEX idx_organizations_suspended
  ON organizations (suspended_at)
  WHERE suspended_at IS NOT NULL;
