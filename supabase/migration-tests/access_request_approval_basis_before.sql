BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='access_requests' AND column_name='approval_basis')
    OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012000100')
  THEN
    RAISE EXCEPTION 'Approval basis fixture requires the preceding schema';
  END IF;
END;
$$;

CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
INSERT INTO auth.users(id,email) VALUES
  ('f3000000-0000-4000-8000-000000000001','basis-inviter@example.test'),
  ('f3000000-0000-4000-8000-000000000002','basis-platform@example.test');
INSERT INTO public.organizations(id,name,created_by) VALUES
  ('f3000000-0000-4000-8000-000000000101','Basis Upgrade Unit','f3000000-0000-4000-8000-000000000001');
INSERT INTO public.organization_invitations(id,organization_id,email,invited_by,expires_at,role,access_scope_kind) VALUES
  ('f3000000-0000-4000-8000-000000000301','f3000000-0000-4000-8000-000000000101','basis-audited@example.test','f3000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization'),
  ('f3000000-0000-4000-8000-000000000302','f3000000-0000-4000-8000-000000000101','basis-invited@example.test','f3000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization'),
  ('f3000000-0000-4000-8000-000000000303','f3000000-0000-4000-8000-000000000101','basis-skewed@example.test','f3000000-0000-4000-8000-000000000001',now()+interval '14 days','member','organization'),
  ('f3000000-0000-4000-8000-000000000304','f3000000-0000-4000-8000-000000000101','basis-hand@example.test','f3000000-0000-4000-8000-000000000002',now()+interval '14 days','member','organization');
INSERT INTO public.access_requests(id,email,name,status,reviewed_by,reviewed_at) VALUES
  ('f3000000-0000-4000-8000-000000000401','basis-audited@example.test','Audited approval','approved','f3000000-0000-4000-8000-000000000001','2026-09-01T12:00:00Z'),
  ('f3000000-0000-4000-8000-000000000402','basis-invited@example.test','Invitation approval','approved','f3000000-0000-4000-8000-000000000001','2026-09-01T12:00:00Z'),
  ('f3000000-0000-4000-8000-000000000403','basis-skewed@example.test','Skewed invitation approval','approved','f3000000-0000-4000-8000-000000000001','2026-09-01T12:00:00Z'),
  ('f3000000-0000-4000-8000-000000000404','basis-hand@example.test','Hand approval then invite','approved','f3000000-0000-4000-8000-000000000002','2026-09-01T12:00:00Z'),
  ('f3000000-0000-4000-8000-000000000405','basis-unlinked@example.test','Unlinked approval','approved',NULL,NULL),
  ('f3000000-0000-4000-8000-000000000406','basis-pending@example.test','Pending','pending',NULL,NULL),
  ('f3000000-0000-4000-8000-000000000407','basis-rejected@example.test','Rejected','rejected','f3000000-0000-4000-8000-000000000002','2026-09-01T12:00:00Z');
INSERT INTO public.access_request_organization_invitation_links(
  access_request_id,organization_invitation_id,organization_id,invited_by,invited_at,intended_membership_role,intended_access_scope_kind
) VALUES
  ('f3000000-0000-4000-8000-000000000401','f3000000-0000-4000-8000-000000000301','f3000000-0000-4000-8000-000000000101','f3000000-0000-4000-8000-000000000001','2026-09-01T11:59:59Z','member','organization'),
  ('f3000000-0000-4000-8000-000000000402','f3000000-0000-4000-8000-000000000302','f3000000-0000-4000-8000-000000000101','f3000000-0000-4000-8000-000000000001','2026-09-01T11:59:59Z','member','organization'),
  ('f3000000-0000-4000-8000-000000000403','f3000000-0000-4000-8000-000000000303','f3000000-0000-4000-8000-000000000101','f3000000-0000-4000-8000-000000000001','2026-09-01T12:04:00Z','member','organization'),
  ('f3000000-0000-4000-8000-000000000404','f3000000-0000-4000-8000-000000000304','f3000000-0000-4000-8000-000000000101','f3000000-0000-4000-8000-000000000002','2026-09-02T12:00:00Z','member','organization');
INSERT INTO public.audit_logs(user_id,action,resource_type,resource_id,details) VALUES
  ('f3000000-0000-4000-8000-000000000002','access_request.approved','access_request','f3000000-0000-4000-8000-000000000401','{"email":"basis-audited@example.test"}');

CREATE TABLE upgrade_fixture.approval_basis_before_rows AS
SELECT id AS row_id, to_jsonb(r) AS row_data FROM public.access_requests r WHERE id::text LIKE 'f3000000-%';
DO $$
BEGIN
  IF (SELECT count(*) FROM upgrade_fixture.approval_basis_before_rows) <> 7 THEN
    RAISE EXCEPTION 'Approval basis upgrade fixture is incomplete';
  END IF;
END;
$$;
COMMIT;
