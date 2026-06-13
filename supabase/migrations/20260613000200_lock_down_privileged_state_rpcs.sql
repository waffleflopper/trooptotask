REVOKE ALL ON FUNCTION public.count_platform_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_platform_users() FROM anon;
REVOKE ALL ON FUNCTION public.count_platform_users() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_platform_users() TO service_role;

REVOKE ALL ON FUNCTION public.daily_signups_last_30_days() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.daily_signups_last_30_days() FROM anon;
REVOKE ALL ON FUNCTION public.daily_signups_last_30_days() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.daily_signups_last_30_days() TO service_role;

REVOKE ALL ON FUNCTION public.count_org_personnel(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_org_personnel(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.count_org_personnel(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_org_personnel(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.is_user_suspended(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
	SELECT CASE
		WHEN current_setting('role', true) = 'service_role'
			OR public.is_platform_admin()
			OR (SELECT auth.uid()) = check_user_id
		THEN EXISTS (
			SELECT 1 FROM public.user_suspensions WHERE user_id = check_user_id
		)
		ELSE false
	END;
$$;

REVOKE ALL ON FUNCTION public.is_user_suspended(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_user_suspended(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_user_suspended(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_suspended(uuid) TO service_role;
