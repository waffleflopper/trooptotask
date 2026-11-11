-- A member's own "left" audit entry is written after their membership row is deleted, so the label resolver from
-- 20261108200000 found no membership and fell back to their email. Someone with no membership keeps their account name.
BEGIN;

CREATE OR REPLACE FUNCTION audit_private.member_label(p_organization_id uuid, p_user_id uuid) RETURNS text
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce(
    CASE WHEN n.name_source IS NOT NULL
      THEN pg_catalog.concat_ws(' ', NULLIF(n.rank, ''), pg_catalog.concat_ws(', ', n.last_name, n.first_name))
    END,
    (SELECT pg_catalog.concat_ws(' ', NULLIF(profile.rank, ''), pg_catalog.concat_ws(', ', profile.last_name, profile.first_name))
      FROM public.user_profiles profile
      WHERE profile.user_id = p_user_id AND (profile.first_name IS NOT NULL OR profile.last_name IS NOT NULL)),
    NULLIF(pg_catalog.btrim(n.email), ''),
    (SELECT account.email::text FROM auth.users account WHERE account.id = p_user_id)
  )
  FROM (SELECT 1) AS one
  LEFT JOIN organization_private.member_names(p_organization_id, ARRAY[p_user_id]) n ON true;
$$;

COMMIT;
