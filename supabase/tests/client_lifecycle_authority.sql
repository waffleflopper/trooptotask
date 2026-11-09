BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.id(n integer) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('f9200000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;
CREATE FUNCTION pg_temp.act_as(n integer) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(n)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(n), 'email', 'lifecycle-' || n || '@example.test', 'role', 'authenticated', 'aal', 'aal2')::text, true)
$$;
INSERT INTO auth.users (id, email) SELECT pg_temp.id(n), 'lifecycle-' || n || '@example.test' FROM generate_series(1,4) n;
INSERT INTO public.organizations (id, name, created_by, url_slug) VALUES
  (pg_temp.id(101), 'Lifecycle Alpha', pg_temp.id(1), 'lifecycle-alpha'),
  (pg_temp.id(102), 'Lifecycle Bravo', pg_temp.id(4), 'lifecycle-bravo');
INSERT INTO public.organization_memberships (organization_id, user_id, role, member_preset, email) VALUES
  (pg_temp.id(101), pg_temp.id(1), 'owner', 'editor', 'lifecycle-1@example.test'),
  (pg_temp.id(101), pg_temp.id(2), 'admin', 'editor', 'lifecycle-2@example.test'),
  (pg_temp.id(101), pg_temp.id(3), 'member', 'editor', 'lifecycle-3@example.test'),
  (pg_temp.id(102), pg_temp.id(4), 'owner', 'editor', 'lifecycle-4@example.test');
INSERT INTO public.data_exports (id, org_id, requested_by, status, created_at) VALUES
  (pg_temp.id(201), pg_temp.id(101), pg_temp.id(1), 'processing', now()),
  (pg_temp.id(202), pg_temp.id(101), pg_temp.id(1), 'processing', now() - interval '61 minutes'),
  (pg_temp.id(203), pg_temp.id(101), pg_temp.id(1), 'processing', now() - interval '1 hour'),
  (pg_temp.id(204), pg_temp.id(102), pg_temp.id(4), 'processing', now());
INSERT INTO public.organization_invitations (id, organization_id, email, invited_by) VALUES
  (pg_temp.id(301), pg_temp.id(101), 'outbox@example.test', pg_temp.id(1));
INSERT INTO public.organization_invitation_email_outbox (id, organization_id, invitation_id, recipient, purpose) VALUES
  (pg_temp.id(401), pg_temp.id(101), pg_temp.id(301), 'outbox@example.test', 'organization_invitation'),
  (pg_temp.id(402), pg_temp.id(101), pg_temp.id(301), 'outbox@example.test', 'organization_invitation'),
  (pg_temp.id(403), pg_temp.id(101), pg_temp.id(301), 'outbox@example.test', 'organization_invitation');
UPDATE public.organization_invitation_email_outbox SET status = 'failed', attempt_count = 3 WHERE id = pg_temp.id(403);

-- These fixture-only bridges exercise service-only maintenance without giving the
-- signed-in role execution rights on the production functions.
CREATE FUNCTION pg_temp.sweep() RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT public.fail_stale_data_exports()
$$;
CREATE FUNCTION pg_temp.mark(n integer, s text) RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT count(*)::integer FROM public.mark_organization_invitation_email_outbox_delivery(
    ('f9200000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid, s, now(), 'synthetic error')
$$;
ALTER FUNCTION pg_temp.sweep() OWNER TO service_role;
ALTER FUNCTION pg_temp.mark(integer, text) OWNER TO service_role;
GRANT EXECUTE ON FUNCTION pg_temp.sweep(), pg_temp.mark(integer, text), pg_temp.id(integer), pg_temp.act_as(integer) TO authenticated;
CREATE FUNCTION pg_temp.reject_feature_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action = 'organization.settings_updated' AND NEW.details->>'strength_floor_percent' = '76' THEN
    RAISE EXCEPTION 'synthetic audit failure';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reject_feature_audit BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_feature_audit();
SET LOCAL ROLE authenticated;
SELECT pg_temp.act_as(1);
SELECT is(current_user, 'authenticated'::name, 'governor assertions use ordinary signed-in authority');
SELECT lives_ok($$ INSERT INTO public.organization_invitations
  (organization_id,email,invited_by,role,member_preset,capability_overrides,access_scope_kind,access_scope_group_ids)
  VALUES (pg_temp.id(101),'valid@example.test',pg_temp.id(1),'member','editor','{}','organization','{}') $$,
  'the actual invitation insert columns succeed using defaults');
SELECT throws_ok(format('INSERT INTO public.organization_invitations (organization_id,email,invited_by) VALUES (%L,%L,%L)',
  pg_temp.id(101),'forged@example.test',pg_temp.id(2)), '42501', NULL, 'governor cannot forge the inviter');
SELECT throws_ok(format('INSERT INTO public.organization_invitations (organization_id,email,invited_by,%I) VALUES (%L,%L,%L,%s)',
  col, pg_temp.id(101), col || '@example.test', pg_temp.id(1), value), '42501', NULL, 'governor cannot insert invitation ' || col)
FROM (VALUES ('status', '''revoked'''), ('accepted_at','now()'), ('accepted_by','NULL'),
  ('declined_at','now()'),('declined_by','NULL'),('revoked_at','now()'),('revoked_by','NULL'),
  ('expired_at','now()'),('blocked_at','now()'),('blocked_by','NULL'),
  ('expires_at', 'now() + interval ''15 days''')) v(col,value);
SELECT pg_temp.act_as(2);
SELECT throws_ok($$ UPDATE public.organizations SET disabled_features = ARRAY['training'] WHERE id = pg_temp.id(101) $$,
  '42501', NULL, 'admin cannot bypass the transactional feature audit');
SELECT is(public.update_organization_feature_settings(pg_temp.id(101), '{"disabled_features":["training"],"strength_floor_percent":75}', '{}'),
  'saved', 'admin can save feature settings through the transaction');
SELECT results_eq($$ SELECT disabled_features, strength_floor_percent FROM public.organizations WHERE id = pg_temp.id(101) $$,
  $$ VALUES (ARRAY['training'], 75::smallint) $$, 'the feature and strength settings persist');
SELECT results_eq($$ SELECT user_id, details FROM public.audit_logs
  WHERE org_id = pg_temp.id(101) AND action = 'organization.settings_updated' $$,
  $$ VALUES (pg_temp.id(2), '{"disabled_features":["training"],"previous_disabled_features":[],"strength_floor_percent":75,"previous_strength_floor_percent":80}'::jsonb) $$,
  'one audit row retains the existing details shape and the signed-in actor');
SELECT is(public.update_organization_feature_settings(pg_temp.id(101), '{"disabled_features":[]}', '{}'), 'stale', 'stale switches do not overwrite the saved change');
SELECT is((SELECT count(*) FROM public.audit_logs WHERE org_id = pg_temp.id(101) AND action = 'organization.settings_updated'),
  1::bigint, 'a stale save adds no audit row');
SELECT throws_ok($$ SELECT public.update_organization_feature_settings(pg_temp.id(101), '{"disabled_features":[],"strength_floor_percent":76}', ARRAY['training']) $$,
  'P0001', 'synthetic audit failure', 'failed audit rejects the entire feature save');
SELECT results_eq($$ SELECT disabled_features, strength_floor_percent FROM public.organizations WHERE id = pg_temp.id(101) $$,
  $$ VALUES (ARRAY['training'], 75::smallint) $$, 'failed audit rolls back both settings');
SELECT throws_ok($$ SELECT public.update_organization_feature_settings(pg_temp.id(102), '{"disabled_features":[]}', '{}') $$,
  '42501', NULL, 'admin cannot save another Organization');
SELECT is(public.update_organization_feature_settings(pg_temp.id(101), '{"disabled_features":["onboarding","training"]}', ARRAY['training']),
  'saved', 'admin can store feature switches in supplied order');
SELECT is(public.update_organization_feature_settings(pg_temp.id(101), '{"disabled_features":["training"]}', ARRAY['onboarding','training']),
  'saved', 'admin can replace the unsorted feature list');
SELECT is((SELECT details->'previous_disabled_features' FROM public.audit_logs
  WHERE org_id = pg_temp.id(101) AND action = 'organization.settings_updated'
    AND details->'previous_disabled_features' = '["onboarding","training"]'::jsonb),
  '["onboarding","training"]'::jsonb, 'audit retains the previous feature list as stored');
SELECT is((SELECT count(*) FROM public.finish_data_export(pg_temp.id(101), pg_temp.id(201), 'completed', 1024)), 1::bigint, 'admin completes a processing export');
SELECT is((SELECT completed_at FROM public.data_exports WHERE id = pg_temp.id(201)), now(), 'database stamps export completion');
SELECT is((SELECT count(*) FROM public.finish_data_export(pg_temp.id(101), pg_temp.id(201), 'failed')), 0::bigint, 'completed export cannot become failed');
SELECT results_eq($$ SELECT status, file_size_bytes FROM public.data_exports WHERE id = pg_temp.id(201) $$,
  $$ VALUES ('completed'::text, 1024::bigint) $$, 'failed attempt preserves completed export');
SELECT is((SELECT count(*) FROM public.finish_data_export(pg_temp.id(102), pg_temp.id(204), 'failed')), 0::bigint, 'admin cannot finish another Organization export');
SELECT throws_ok($$ UPDATE public.data_exports SET status = 'failed' WHERE id = pg_temp.id(201) $$, '42501', NULL, 'direct export lifecycle write denied');
SELECT throws_ok($$ SELECT public.fail_stale_data_exports() $$, '42501', NULL, 'ordinary admin cannot sweep all Organizations');
SELECT throws_ok($$ SELECT public.mark_organization_invitation_email_outbox_delivery(pg_temp.id(401),'sent') $$, '42501', NULL, 'ordinary admin cannot mark service delivery');
SELECT is(pg_temp.sweep(), 1, 'service sweep fails only processing exports older than one hour');
SELECT results_eq($$ SELECT id, status FROM public.data_exports WHERE org_id = pg_temp.id(101) ORDER BY id $$,
  $$ VALUES (pg_temp.id(201),'completed'::text),(pg_temp.id(202),'failed'::text),(pg_temp.id(203),'processing'::text) $$, 'sweep preserves completed and exactly-one-hour rows');
SELECT is(pg_temp.mark(401,'sent'), 1, 'service records a sent invitation');
SELECT is(pg_temp.mark(401,'failed'), 0, 'sent outbox delivery is terminal');
SELECT is(pg_temp.mark(402,'sent_recording_failed'), 1, 'service can record successful send with failed acknowledgement');
SELECT is(pg_temp.mark(402,'sent'), 0, 'uncertain acknowledgement cannot be retried');
SELECT is(pg_temp.mark(403,'sent'), 0, 'the SQL delivery attempt cap remains three');
SELECT pg_temp.act_as(3);
SELECT throws_ok($$ SELECT public.update_organization_feature_settings(pg_temp.id(101), '{"disabled_features":[]}', ARRAY['training']) $$,
  '42501', NULL, 'ordinary member cannot save feature settings');
SELECT is((SELECT count(*) FROM public.finish_data_export(pg_temp.id(101), pg_temp.id(203), 'failed')), 0::bigint, 'ordinary member cannot finish exports');
SELECT throws_ok($$ INSERT INTO public.organization_invitations (organization_id,email,invited_by) VALUES (pg_temp.id(101),'member-invite@example.test',pg_temp.id(3)) $$,
  '42501', NULL, 'ordinary member cannot invite');
SELECT throws_ok(format('UPDATE public.counseling_records SET %I = %s', col, value), '42501', NULL, 'member cannot write counseling ' || col)
FROM (VALUES ('status', '''acknowledged'''), ('soldier_signed_at', 'now()'), ('counselor_signed_at', 'now()')) v(col,value);
SELECT throws_ok(format('UPDATE public.%I SET %I = NULL', tbl, col), '42501', NULL, tbl || '.' || col || ' cannot be updated directly')
FROM (VALUES ('counseling_records','uploaded_by'),('counseling_records','archived_by'),('counseling_records','archived_at'),
  ('personnel_follow_ups','status'),('personnel_follow_ups','created_by'),('personnel_follow_ups','completed_by'),
  ('personnel_follow_ups','completed_at'),('personnel_follow_ups','archived_at'),('personnel_follow_ups','archived_by')) v(tbl,col);
SELECT throws_ok(format('INSERT INTO public.%I (%I) VALUES (NULL)', tbl, col), '42501', NULL, tbl || '.' || col || ' cannot be inserted directly')
FROM (VALUES ('counseling_records','uploaded_by'),('counseling_records','archived_at'),('personnel_follow_ups','status'),
  ('personnel_follow_ups','created_by'),('personnel_follow_ups','completed_by'),('personnel_follow_ups','archived_by')) v(tbl,col);
SELECT * FROM finish();
ROLLBACK;
