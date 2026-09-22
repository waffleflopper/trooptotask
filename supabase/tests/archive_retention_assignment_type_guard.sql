BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);

INSERT INTO auth.users(id,email) VALUES
  ('c5190000-0000-4000-8000-000000000001','retention-sql-owner@example.test'),
  ('c5190000-0000-4000-8000-000000000002','retention-sql-foreign@example.test');
INSERT INTO public.organizations(id,name,created_by,url_slug) VALUES
  ('c5190000-0000-4000-8000-000000000011','Retention SQL Alpha','c5190000-0000-4000-8000-000000000001','retention-sql-alpha'),
  ('c5190000-0000-4000-8000-000000000012','Retention SQL Foreign','c5190000-0000-4000-8000-000000000002','retention-sql-foreign');
INSERT INTO public.organization_memberships(id,organization_id,user_id,role) VALUES
  ('c5190000-0000-4000-8000-000000000021','c5190000-0000-4000-8000-000000000011','c5190000-0000-4000-8000-000000000001','owner'),
  ('c5190000-0000-4000-8000-000000000022','c5190000-0000-4000-8000-000000000012','c5190000-0000-4000-8000-000000000002','owner');
INSERT INTO public.groups(id,organization_id,name) VALUES
  ('c5190000-0000-4000-8000-000000000031','c5190000-0000-4000-8000-000000000011','Retention Group');
INSERT INTO public.personnel(id,organization_id,group_id,rank,first_name,last_name,clinic_role,mos,slug) VALUES
  ('c5190000-0000-4000-8000-000000000032','c5190000-0000-4000-8000-000000000011','c5190000-0000-4000-8000-000000000031','SGT','Retention','Person','Respiratory Therapist','68V','retention-sql-person');
INSERT INTO public.assignment_types(id,organization_id,name,short_name,assign_to,archived_at) VALUES
  ('c5190000-0000-4000-8000-000000000041','c5190000-0000-4000-8000-000000000011','Saved person','SP','personnel','2024-01-01Z'),
  ('c5190000-0000-4000-8000-000000000042','c5190000-0000-4000-8000-000000000011','Saved group','SG','group','2024-01-01Z'),
  ('c5190000-0000-4000-8000-000000000043','c5190000-0000-4000-8000-000000000011','Unused old','UO','personnel','2024-01-01Z'),
  ('c5190000-0000-4000-8000-000000000044','c5190000-0000-4000-8000-000000000011','Recent','RA','personnel','2026-01-01Z'),
  ('c5190000-0000-4000-8000-000000000045','c5190000-0000-4000-8000-000000000012','Foreign old','FO','personnel','2024-01-01Z');
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id) VALUES
  ('c5190000-0000-4000-8000-000000000051','c5190000-0000-4000-8000-000000000011','c5190000-0000-4000-8000-000000000041','2025-01-02','c5190000-0000-4000-8000-000000000032'),
  ('c5190000-0000-4000-8000-000000000052','c5190000-0000-4000-8000-000000000011','c5190000-0000-4000-8000-000000000042','2025-01-03','c5190000-0000-4000-8000-000000000031');
INSERT INTO public.duty_roster_templates(id,organization_id,name,slug,assignment_type_id,status,archived_at) VALUES
  ('c5190000-0000-4000-8000-000000000061','c5190000-0000-4000-8000-000000000011','Retired sentinel','retired-sql-sentinel','c5190000-0000-4000-8000-000000000041','archived','2024-01-01Z');

SELECT ok(NOT has_function_privilege('anon', 'public.delete_expired_unreferenced_assignment_types(uuid,uuid[],timestamptz)', 'EXECUTE'), 'anonymous role cannot run retention deletion');
SELECT ok(NOT has_function_privilege('authenticated', 'public.delete_expired_unreferenced_assignment_types(uuid,uuid[],timestamptz)', 'EXECUTE'), 'member role cannot run retention deletion');
SELECT ok(has_function_privilege('service_role', 'public.delete_expired_unreferenced_assignment_types(uuid,uuid[],timestamptz)', 'EXECUTE'), 'service role can run retention deletion');
SELECT is(
  public.delete_expired_unreferenced_assignment_types(
    'c5190000-0000-4000-8000-000000000011',
    ARRAY[
      'c5190000-0000-4000-8000-000000000041',
      'c5190000-0000-4000-8000-000000000042',
      'c5190000-0000-4000-8000-000000000043',
      'c5190000-0000-4000-8000-000000000044',
      'c5190000-0000-4000-8000-000000000045'
    ]::uuid[],
    '2025-09-22Z'
  ),
  1,
  'only the expired unused type is deleted'
);
SELECT is((SELECT count(*)::integer FROM public.assignment_types WHERE organization_id='c5190000-0000-4000-8000-000000000011'), 3, 'saved and recent types remain');
SELECT is((SELECT count(*)::integer FROM public.daily_assignments WHERE organization_id='c5190000-0000-4000-8000-000000000011'), 2, 'person and Group Calendar assignments remain');
SELECT is((SELECT count(*)::integer FROM public.duty_roster_templates WHERE id='c5190000-0000-4000-8000-000000000061'), 1, 'retired template linked to saved Calendar type remains');
SELECT is((SELECT count(*)::integer FROM public.assignment_types WHERE organization_id='c5190000-0000-4000-8000-000000000012'), 1, 'foreign Organization type remains');
SELECT is((SELECT count(*)::integer FROM public.assignment_types WHERE id='c5190000-0000-4000-8000-000000000044'), 1, 'recent archived type remains');
SELECT is(public.delete_expired_unreferenced_assignment_types('c5190000-0000-4000-8000-000000000011', ARRAY['c5190000-0000-4000-8000-000000000043']::uuid[], '2025-09-22Z'), 0, 'repeat cleanup does not delete another row');

SELECT * FROM finish();
ROLLBACK;
