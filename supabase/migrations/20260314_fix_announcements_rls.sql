-- Fix infinite recursion in platform_announcements RLS
-- The "Platform admins can manage announcements" policy uses FOR ALL which includes SELECT.
-- When evaluating SELECT, Postgres checks both the SELECT policy AND the ALL policy.
-- The ALL policy queries platform_admins which has its own RLS, causing infinite recursion.
-- Fix: Replace FOR ALL with separate INSERT/UPDATE/DELETE policies so SELECT is only
-- handled by the simple "auth.uid() IS NOT NULL" policy.

DROP POLICY IF EXISTS "Platform admins can manage announcements" ON platform_announcements;

CREATE POLICY "Platform admins can insert announcements"
  ON platform_announcements
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

CREATE POLICY "Platform admins can update announcements"
  ON platform_announcements
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );

CREATE POLICY "Platform admins can delete announcements"
  ON platform_announcements
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM platform_admins
      WHERE platform_admins.user_id = auth.uid()
      AND platform_admins.is_active = true
    )
  );
