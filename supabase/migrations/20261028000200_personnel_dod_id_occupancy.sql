BEGIN;

CREATE FUNCTION public.personnel_dod_ids_in_use(p_organization_id uuid, p_dod_ids text[])
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(array_agg(DISTINCT sheet.dod_id ORDER BY sheet.dod_id), ARRAY[]::text[])
  FROM public.personnel_extended_info AS sheet
  WHERE public.member_access_has_capability(p_organization_id, 'personnel', 'operate')
    AND sheet.organization_id = p_organization_id
    AND sheet.dod_id = ANY(p_dod_ids);
$$;

REVOKE ALL ON FUNCTION public.personnel_dod_ids_in_use(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.personnel_dod_ids_in_use(uuid, text[]) TO authenticated;

COMMIT;
