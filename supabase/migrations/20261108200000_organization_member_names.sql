-- #2063 Owners and admins name the members whose own account has no name. The name belongs to the membership, so it
-- shows only in that Organization, and user_profiles stays the user's own. Inside an Organization a member's name is
-- the account profile when it has a first or last name, else the Organization's value, else the email. The rank
-- travels with whichever source supplies the name.
BEGIN;

ALTER TABLE public.organization_memberships
  ADD COLUMN org_rank text,
  ADD COLUMN org_first_name text,
  ADD COLUMN org_last_name text;

ALTER TABLE public.organization_memberships
  ADD CONSTRAINT organization_memberships_org_first_name_check
    CHECK (org_first_name IS NULL OR length(btrim(org_first_name)) > 0),
  ADD CONSTRAINT organization_memberships_org_last_name_check
    CHECK (org_last_name IS NULL OR length(btrim(org_last_name)) > 0),
  ADD CONSTRAINT organization_memberships_org_rank_check
    CHECK (org_rank IS NULL OR org_rank = ANY (ARRAY['PV1', 'PV2', 'PFC', 'SPC', 'CPL', 'SGT', 'SSG', 'SFC', 'MSG', '1SG',
      'SGM', 'CSM', 'WO1', 'CW2', 'CW3', 'CW4', 'CW5', '2LT', '1LT', 'CPT', 'MAJ', 'LTC', 'COL', 'BG', 'MG', 'LTG', 'GEN',
      'CIV']));

-- The one resolver. A set so it joins; callers add their own admission check.
CREATE FUNCTION organization_private.member_names(p_organization_id uuid, p_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE (user_id uuid, rank text, first_name text, last_name text, email text, name_source text)
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT m.user_id,
    CASE source.name_source WHEN 'account' THEN profile.rank WHEN 'organization' THEN m.org_rank END,
    CASE source.name_source WHEN 'account' THEN profile.first_name WHEN 'organization' THEN m.org_first_name END,
    CASE source.name_source WHEN 'account' THEN profile.last_name WHEN 'organization' THEN m.org_last_name END,
    m.email,
    source.name_source
  FROM public.organization_memberships m
  LEFT JOIN public.user_profiles profile ON profile.user_id = m.user_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN profile.first_name IS NOT NULL OR profile.last_name IS NOT NULL THEN 'account'
      WHEN m.org_first_name IS NOT NULL OR m.org_last_name IS NOT NULL THEN 'organization'
    END AS name_source
  ) source
  WHERE m.organization_id = p_organization_id AND (p_user_ids IS NULL OR m.user_id = ANY (p_user_ids));
$$;
REVOKE ALL ON FUNCTION organization_private.member_names(uuid, uuid[]) FROM PUBLIC, anon, authenticated, service_role;

-- The return type gains name_source and the read can name the members it needs.
DROP FUNCTION public.organization_member_labels(uuid);
CREATE FUNCTION public.organization_member_labels(p_organization_id uuid, p_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE (user_id uuid, rank text, first_name text, last_name text, email text, name_source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT n.user_id, n.rank, n.first_name, n.last_name, n.email, n.name_source
  FROM organization_private.member_names(p_organization_id, p_user_ids) n
  WHERE EXISTS (SELECT 1 FROM public.organization_memberships caller
      WHERE caller.organization_id = p_organization_id AND caller.user_id = auth.uid())
    AND public.organization_access_admitted(p_organization_id)
  ORDER BY n.user_id;
$$;
REVOKE ALL ON FUNCTION public.organization_member_labels(uuid, uuid[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.organization_member_labels(uuid, uuid[]) TO authenticated;
ALTER FUNCTION public.organization_member_labels(uuid, uuid[]) OWNER TO postgres;

-- Audit actor labels follow the same precedence: name, else the membership email, else the account email.
CREATE OR REPLACE FUNCTION audit_private.member_label(p_organization_id uuid, p_user_id uuid) RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    CASE WHEN n.name_source IS NOT NULL
      THEN pg_catalog.concat_ws(' ', NULLIF(n.rank, ''), pg_catalog.concat_ws(', ', n.last_name, n.first_name))
    END,
    NULLIF(pg_catalog.btrim(n.email), ''),
    (SELECT account.email::text FROM auth.users account WHERE account.id = p_user_id)
  )
  FROM (SELECT 1) AS one
  LEFT JOIN organization_private.member_names(p_organization_id, ARRAY[p_user_id]) n ON true;
$$;

-- The only write path to the Organization name. Clients get no UPDATE grant on the columns, so the check and the
-- write cannot be separated. The result carries the stored values for the caller to confirm and audit.
CREATE FUNCTION public.set_organization_member_name(
  p_organization_id uuid,
  p_user_id uuid,
  p_rank text,
  p_first_name text,
  p_last_name text
) RETURNS TABLE (
  member_user_id uuid,
  previous_rank text,
  previous_first_name text,
  previous_last_name text,
  saved_rank text,
  saved_first_name text,
  saved_last_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_before public.organization_memberships%ROWTYPE;
  v_after public.organization_memberships%ROWTYPE;
BEGIN
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Naming a member requires READ COMMITTED' USING ERRCODE = '25001';
  END IF;
  IF v_actor IS NULL OR NOT public.can_manage_org_members(p_organization_id) THEN
    RAISE EXCEPTION 'Naming a member is not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_rank IS NULL OR p_first_name IS NULL OR p_last_name IS NULL THEN
    RAISE EXCEPTION 'A member name needs a rank, first name and last name' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_before FROM public.organization_memberships m
  WHERE m.organization_id = p_organization_id AND m.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.organization_memberships m
  SET org_rank = p_rank, org_first_name = p_first_name, org_last_name = p_last_name
  WHERE m.id = v_before.id
  RETURNING * INTO v_after;

  -- Fresh statement after a possible wait on a concurrent change of this row.
  IF NOT public.can_manage_org_members(p_organization_id) THEN
    RAISE EXCEPTION 'Naming a member is not allowed' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY SELECT v_after.user_id, v_before.org_rank, v_before.org_first_name, v_before.org_last_name,
    v_after.org_rank, v_after.org_first_name, v_after.org_last_name;
END;
$$;
REVOKE ALL ON FUNCTION public.set_organization_member_name(uuid, uuid, text, text, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_organization_member_name(uuid, uuid, text, text, text) TO authenticated;
ALTER FUNCTION public.set_organization_member_name(uuid, uuid, text, text, text) OWNER TO postgres;

COMMIT;
