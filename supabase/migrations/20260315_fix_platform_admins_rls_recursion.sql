-- Fix infinite recursion in platform_admins RLS policies
-- The "Admins can read" and "Super admins can manage" policies were querying
-- platform_admins directly (or via is_platform_admin() which is SECURITY DEFINER
-- but the other policy queries the table inline), causing recursive RLS evaluation.
--
-- Fix: Replace the recursive policies with ones using SECURITY DEFINER functions
-- that bypass RLS, and keep the simple "users can check own status" policy.

-- Drop the recursive policies
DROP POLICY IF EXISTS "Admins can read platform_admins" ON platform_admins;
DROP POLICY IF EXISTS "Super admins can manage platform_admins" ON platform_admins;

-- Create a SECURITY DEFINER helper for super_admin check (bypasses RLS)
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid() AND is_active = true AND role = 'super_admin'
  );
$$;

-- Admins can read all rows (uses SECURITY DEFINER function, no recursion)
CREATE POLICY "Admins can read platform_admins"
  ON platform_admins
  FOR SELECT
  USING (public.is_platform_admin());

-- Super admins can insert/update/delete (uses SECURITY DEFINER function, no recursion)
CREATE POLICY "Super admins can manage platform_admins"
  ON platform_admins
  FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());
