BEGIN;

-- The Assignment load lens shares each past day by the pool its own DA 6 form drew from. The roster_forms read policy
-- admits only organization-wide Calendar readers because a form's record is the whole Organization's closed history.
-- A Group-scoped Calendar reader gets the pool rules alone: ranks, MOS, roles and Group IDs, never a record.
CREATE FUNCTION public.roster_pool_spans(p_organization_id uuid, p_from date, p_through date)
RETURNS TABLE (assignment_type_id uuid, starts_on date, ends_on date, pool jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT f.assignment_type_id, f.starts_on, f.ends_on, f.rules -> 'pool'
  FROM public.roster_forms AS f
  WHERE (SELECT public.member_access_has_capability(p_organization_id, 'calendar', 'view'))
    AND f.organization_id = p_organization_id
    AND f.starts_on <= p_through
    AND (f.ends_on IS NULL OR f.ends_on >= p_from)
  ORDER BY f.starts_on, f.id;
$$;

ALTER FUNCTION public.roster_pool_spans(uuid, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.roster_pool_spans(uuid, date, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.roster_pool_spans(uuid, date, date) TO authenticated;

COMMIT;
