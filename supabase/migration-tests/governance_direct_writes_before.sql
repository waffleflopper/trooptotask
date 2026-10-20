-- Saved governance rows before direct write authority narrows.
CREATE SCHEMA IF NOT EXISTS upgrade_fixture;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.role', '', false);
SELECT set_config('request.jwt.claims', '{}', false);
SELECT set_config('request.jwt', '', false);
INSERT INTO auth.users(id,email)
SELECT ('c6421000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'governance-upgrade-' || n || '@example.test' FROM generate_series(1,7) n;
INSERT INTO public.organizations(id,name,created_by) VALUES
('c6421000-0000-4000-8000-000000000101','Governance Upgrade','c6421000-0000-4000-8000-000000000001'),
('c6421000-0000-4000-8000-000000000102','Governance Upgrade Other','c6421000-0000-4000-8000-000000000001');
INSERT INTO public.groups(id,organization_id,name) VALUES
('c6421000-0000-4000-8000-000000000202','c6421000-0000-4000-8000-000000000102','Other Organization Group');
INSERT INTO public.organization_memberships(
  id,organization_id,user_id,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids
) VALUES
('c6421000-0000-4000-8000-000000000301','c6421000-0000-4000-8000-000000000101','c6421000-0000-4000-8000-000000000001','owner','viewer','{}','organization',ARRAY[]::uuid[]),
('c6421000-0000-4000-8000-000000000302','c6421000-0000-4000-8000-000000000101','c6421000-0000-4000-8000-000000000002','admin','viewer','{}','organization',ARRAY[]::uuid[]),
('c6421000-0000-4000-8000-000000000303','c6421000-0000-4000-8000-000000000101','c6421000-0000-4000-8000-000000000003','member','editor','{}','organization',ARRAY[]::uuid[]),
('c6421000-0000-4000-8000-000000000304','c6421000-0000-4000-8000-000000000101','c6421000-0000-4000-8000-000000000004','member','viewer','{"canManageMembers":true}','organization',ARRAY[]::uuid[]),
('c6421000-0000-4000-8000-000000000305','c6421000-0000-4000-8000-000000000101','c6421000-0000-4000-8000-000000000007','member','operator','{}','groups',ARRAY['c6421000-0000-4000-8000-000000000202']::uuid[]);
INSERT INTO public.organization_invitations(
  id,organization_id,email,invited_by,status,expires_at,role,member_preset,
  capability_overrides,access_scope_kind,access_scope_group_ids,revoked_at
) VALUES
('c6421000-0000-4000-8000-000000000501','c6421000-0000-4000-8000-000000000101','governance-upgrade-5@example.test','c6421000-0000-4000-8000-000000000001','pending',now() + interval '7 days','owner','viewer','{}','organization',ARRAY[]::uuid[],NULL),
('c6421000-0000-4000-8000-000000000502','c6421000-0000-4000-8000-000000000101','governance-upgrade-6@example.test','c6421000-0000-4000-8000-000000000002','pending',now() + interval '7 days','member','editor','{}','organization',ARRAY[]::uuid[],NULL),
('c6421000-0000-4000-8000-000000000503','c6421000-0000-4000-8000-000000000101','governance-upgrade-history@example.test','c6421000-0000-4000-8000-000000000001','revoked',now() - interval '1 day','owner','viewer','{}','organization',ARRAY[]::uuid[],'2030-01-02T03:04:05.678Z');
CREATE VIEW upgrade_fixture.governance_direct_writes_current_rows AS
SELECT 'organizations'::text table_name,id::text row_id,to_jsonb(r) - 'training_readiness_goal_percent' - 'disabled_features' - 'strength_floor_percent' row_data
  FROM public.organizations r WHERE id::text LIKE 'c6421000-%'
UNION ALL SELECT 'memberships',id::text,to_jsonb(r) FROM public.organization_memberships r WHERE id::text LIKE 'c6421000-%'
UNION ALL SELECT 'invitations',id::text,to_jsonb(r) FROM public.organization_invitations r WHERE id::text LIKE 'c6421000-%';
CREATE TABLE upgrade_fixture.governance_direct_writes_before_rows AS
  SELECT * FROM upgrade_fixture.governance_direct_writes_current_rows;
SELECT set_config('request.jwt.claim.sub','c6421000-0000-4000-8000-000000000004',false);
CREATE TABLE upgrade_fixture.governance_direct_writes_baseline AS
SELECT NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261012000400') migration_absent,
  public.can_export_organization_data('c6421000-0000-4000-8000-000000000101') legacy_flag_could_export;
SELECT set_config('request.jwt.claim.sub','',false);
