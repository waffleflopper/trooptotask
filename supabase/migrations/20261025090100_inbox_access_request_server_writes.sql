BEGIN;

DROP POLICY "Platform admins can manage access requests" ON public.access_requests;
CREATE POLICY "Operators can read access requests" ON public.access_requests
	FOR SELECT TO authenticated USING (public.is_platform_operator());
-- Reviews bind the reviewer, request assurance and awaited audit at the server, which writes as service_role.
REVOKE ALL ON public.access_requests FROM anon, authenticated;
GRANT SELECT ON public.access_requests TO authenticated;

CREATE FUNCTION public.platform_inbox_stats(p_since timestamptz) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
	SELECT pg_catalog.jsonb_build_object(
		'newPeople', (SELECT pg_catalog.count(*) FROM auth.users WHERE created_at >= p_since),
		'newOrganizations', (SELECT pg_catalog.count(*) FROM public.organizations WHERE created_at >= p_since)
	);
$$;
REVOKE ALL ON FUNCTION public.platform_inbox_stats(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_inbox_stats(timestamptz) TO service_role;

COMMIT;
