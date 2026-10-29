BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('7a530000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(n)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(n), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.affected(statement text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE changed bigint;
BEGIN
  EXECUTE statement;
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END;
$$;

INSERT INTO auth.users (id, email) SELECT pg_temp.id(n), 'artifact-writes-' || n || '@example.test'
FROM generate_series(1, 4) n;
INSERT INTO public.organizations (id, name, created_by)
VALUES (pg_temp.id(101), 'Artifact write scope', pg_temp.id(3));
INSERT INTO public.groups (id, organization_id, name)
VALUES (pg_temp.id(201), pg_temp.id(101), 'Platoon');
INSERT INTO public.groups (id, organization_id, parent_id, name)
VALUES (pg_temp.id(202), pg_temp.id(101), pg_temp.id(201), 'Squad');
INSERT INTO public.groups (id, organization_id, parent_id, name)
VALUES (pg_temp.id(203), pg_temp.id(101), pg_temp.id(202), 'Team');
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides,
  access_scope_kind, access_scope_group_ids
) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'member', 'viewer', '{"personnel":"operate"}', 'groups', ARRAY[pg_temp.id(201)]),
  (pg_temp.id(101), pg_temp.id(2), 'member', 'viewer', '{"personnel":"operate"}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(3), 'owner', 'viewer', '{}', 'organization', ARRAY[]::uuid[]),
  (pg_temp.id(101), pg_temp.id(4), 'admin', 'viewer', '{}', 'organization', ARRAY[]::uuid[]);
INSERT INTO public.personnel (id, organization_id, group_id, rank, first_name, last_name, slug)
VALUES (pg_temp.id(301), pg_temp.id(101), NULL, 'SPC', 'Synthetic', 'Person', 'artifact-write-scope');
INSERT INTO public.counseling_records (
  id, organization_id, personnel_id, date_conducted, subject, title, uploaded_by, archived_at
) VALUES (pg_temp.id(401), pg_temp.id(101), pg_temp.id(301), '2030-01-01', 'Fixture', 'Fixture', 'fixture', '2030-01-02');
INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text, archived_at)
VALUES (pg_temp.id(402), pg_temp.id(101), pg_temp.id(301), 'fixture', 'Fixture', '2030-01-02');
INSERT INTO public.personnel_documents (
  id, organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by, archived_at
) VALUES (
  pg_temp.id(403), pg_temp.id(101), pg_temp.id(301), 'Fixture',
  pg_temp.id(101) || '/personnel/' || pg_temp.id(301) || '/documents/fixture.pdf',
  128, 'application/pdf', 'fixture', '2030-01-02'
);

CREATE FUNCTION pg_temp.check_writes(expected_changes bigint, allowed_insert boolean) RETURNS SETOF text
LANGUAGE plpgsql AS $$
DECLARE artifact record;
BEGIN
  RETURN NEXT is(current_user::text, 'authenticated', 'artifact writes run as the ordinary authenticated role');
  RETURN NEXT ok(public.member_access_has_capability(pg_temp.id(101), 'personnel', 'operate'),
    'the actor has Personnel operate');
  RETURN NEXT ok(NOT public.member_access_has_capability(pg_temp.id(101), 'personnel', 'configure'),
    'artifact writes need no Personnel configure capability');
  FOR artifact IN SELECT * FROM (VALUES
    ('counseling_records', 'title',
      'INSERT INTO public.counseling_records (organization_id, personnel_id, date_conducted, subject, title, uploaded_by)
       VALUES (pg_temp.id(101), pg_temp.id(301), ''2030-01-01'', ''Inserted'', ''Inserted'', ''fixture'')'),
    ('leader_notes', 'text',
      'INSERT INTO public.leader_notes (organization_id, personnel_id, author, text)
       VALUES (pg_temp.id(101), pg_temp.id(301), ''fixture'', ''Inserted'')'),
    ('personnel_documents', 'title',
      'INSERT INTO public.personnel_documents (organization_id, personnel_id, title, file_path, file_size_bytes, content_type, uploaded_by)
       VALUES (pg_temp.id(101), pg_temp.id(301), ''Inserted'',
         pg_temp.id(101) || ''/personnel/'' || pg_temp.id(301) || ''/documents/inserted.pdf'', 128, ''application/pdf'', ''fixture'')')
  ) AS fixtures(table_name, changed_column, insert_sql)
  LOOP
    -- Avoid SELECT-dependent predicates and RETURNING so sensitive-read policy cannot mask write authorization.
    RETURN NEXT is(pg_temp.affected(format('UPDATE public.%I SET %I = ''Updated''', artifact.table_name, artifact.changed_column)),
      expected_changes, artifact.table_name || ' UPDATE follows the Person scope');
    RETURN NEXT is(pg_temp.affected(format('DELETE FROM public.%I', artifact.table_name)),
      expected_changes, artifact.table_name || ' DELETE follows the Person scope');
    IF allowed_insert THEN
      RETURN NEXT is(pg_temp.affected(artifact.insert_sql), 1::bigint, artifact.table_name || ' INSERT follows the Person scope');
    ELSE
      RETURN NEXT throws_ok(artifact.insert_sql, '42501', NULL, artifact.table_name || ' INSERT denies an ungrouped Person');
    END IF;
  END LOOP;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act(1);
SELECT is(public.member_access_group_scope_matches(pg_temp.id(101), NULL), false,
  'Group scope excludes an ungrouped Person');
SAVEPOINT group_ungrouped;
SELECT * FROM pg_temp.check_writes(0, false);
ROLLBACK TO SAVEPOINT group_ungrouped;

SELECT pg_temp.act(2);
SELECT is(public.member_access_group_scope_matches(pg_temp.id(101), NULL), true,
  'Organization scope includes an ungrouped Person');
SAVEPOINT organization_ungrouped;
SELECT * FROM pg_temp.check_writes(1, true);
ROLLBACK TO SAVEPOINT organization_ungrouped;

SELECT pg_temp.act(3);
SELECT is(public.member_access_group_scope_matches(pg_temp.id(101), NULL), true,
  'owners retain ungrouped access');
SELECT pg_temp.act(4);
SELECT is(public.member_access_group_scope_matches(pg_temp.id(101), NULL), true,
  'admins retain ungrouped access');

RESET ROLE;
UPDATE public.personnel SET group_id = pg_temp.id(203) WHERE id = pg_temp.id(301);
SET LOCAL ROLE authenticated;
SELECT pg_temp.act(1);
SELECT is(public.member_access_group_scope_matches(pg_temp.id(101), pg_temp.id(203)), true,
  'a root Group grant includes a Person in a third-level sub-group');
SELECT * FROM pg_temp.check_writes(1, true);

SELECT * FROM finish();
ROLLBACK;
