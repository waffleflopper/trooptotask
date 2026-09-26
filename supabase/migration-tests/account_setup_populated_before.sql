-- This committed fixture is loaded into a disposable project at migration 138.
-- The snapshot survives the CLI migration process, so the post-upgrade test
-- compares persisted row identities and every stored value across processes.
BEGIN;
DO $$
BEGIN
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations
      WHERE version IN ('20260923000100', '20260923000200', '20260926000100')) <> 0 THEN
    RAISE EXCEPTION 'Account Setup upgrade fixture requires the pre-D02 schema';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.account_setup_links', 'UPDATE') THEN
    RAISE EXCEPTION 'Account Setup upgrade fixture requires the historical table grant';
  END IF;
END;
$$;

INSERT INTO auth.users (id, email) VALUES
  ('b4000000-0000-4000-8000-000000000001', 'upgrade-support@example.test');
INSERT INTO public.platform_admins (id, user_id, role, is_active) VALUES
  ('b4000000-0000-4000-8000-000000000011', 'b4000000-0000-4000-8000-000000000001', 'support', true);
INSERT INTO public.access_requests (id, email, name, status) VALUES
  ('b4000000-0000-4000-8000-000000000101', 'upgrade-claim@example.test', 'First held request', 'approved'),
  ('b4000000-0000-4000-8000-000000000102', 'upgrade-claim@example.test', 'Second held request', 'approved'),
  ('b4000000-0000-4000-8000-000000000103', 'upgrade-claim@example.test', 'Fresh request', 'approved');
INSERT INTO public.account_setup_links
  (id, access_request_id, token_hash, expires_at, claimed_at, revoked_at, revocation_reason)
VALUES
  ('b4000000-0000-4000-8000-000000000201', 'b4000000-0000-4000-8000-000000000101', 'upgrade-first-held-hash',
   '2030-01-01T00:00:00Z', '2029-12-30T00:00:00Z', '2029-12-31T00:00:00Z', 'manual'),
  ('b4000000-0000-4000-8000-000000000202', 'b4000000-0000-4000-8000-000000000102', 'upgrade-second-held-hash',
   '2030-01-02T00:00:00Z', '2030-01-01T00:00:00Z', NULL, NULL),
  ('b4000000-0000-4000-8000-000000000203', 'b4000000-0000-4000-8000-000000000103', 'upgrade-fresh-hash',
   '2030-01-02T00:00:00Z', NULL, NULL, NULL);

CREATE SCHEMA upgrade_fixture;
CREATE TABLE upgrade_fixture.before_rows (
  table_name text NOT NULL,
  row_id uuid NOT NULL,
  row_data jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id)
);
INSERT INTO upgrade_fixture.before_rows
SELECT 'auth.users', id, to_jsonb(row_value) FROM auth.users AS row_value
WHERE id = 'b4000000-0000-4000-8000-000000000001'
UNION ALL
SELECT 'public.platform_admins', id, to_jsonb(row_value) FROM public.platform_admins AS row_value
WHERE id = 'b4000000-0000-4000-8000-000000000011'
UNION ALL
SELECT 'public.access_requests', id, to_jsonb(row_value) FROM public.access_requests AS row_value
WHERE id IN ('b4000000-0000-4000-8000-000000000101', 'b4000000-0000-4000-8000-000000000102',
             'b4000000-0000-4000-8000-000000000103')
UNION ALL
SELECT 'public.account_setup_links', id, to_jsonb(row_value) FROM public.account_setup_links AS row_value
WHERE id IN ('b4000000-0000-4000-8000-000000000201', 'b4000000-0000-4000-8000-000000000202',
             'b4000000-0000-4000-8000-000000000203');
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.before_rows) <> 8 THEN
    RAISE EXCEPTION 'Account Setup upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
