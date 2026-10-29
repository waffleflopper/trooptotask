BEGIN;

DROP FUNCTION public.list_rating_scheme_personnel_lookup(uuid);

CREATE FUNCTION public.list_rating_scheme_personnel_lookup(p_organization_id uuid)
RETURNS TABLE(id uuid, rank text, last_name text, first_name text, group_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.rank, p.last_name, p.first_name, p.group_id
  FROM public.personnel p
  WHERE p.organization_id = p_organization_id
    AND p.archived_at IS NULL
    AND public.member_access_has_capability(p_organization_id, 'ratingScheme', 'view')
    AND public.rating_scheme_personnel_group_scope_matches(p_organization_id, p.group_id)
  ORDER BY p.last_name ASC, p.first_name ASC;
$$;

ALTER FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") OWNER TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") TO "service_role";

NOTIFY "pgrst", 'reload schema';

COMMIT;
