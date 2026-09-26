BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

INSERT INTO public.access_requests(id,email,name,status) VALUES
 ('e1000000-0000-4000-8000-000000000001','recovery@example.test','Recovery Source','approved'),
 ('e1000000-0000-4000-8000-000000000002','recovery@example.test','Recovery Target','approved'),
 ('e1000000-0000-4000-8000-000000000003','other@example.test','Other','approved'),
 ('e1000000-0000-4000-8000-000000000004','new@example.test','New Source','approved'),
 ('e1000000-0000-4000-8000-000000000005','new@example.test','New Target','approved'),
 ('e1000000-0000-4000-8000-000000000006','legacy@example.test','Legacy Source','approved'),
 ('e1000000-0000-4000-8000-000000000007','legacy@example.test','Legacy Target','approved');
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,expires_at) VALUES
 ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','reconcile-source','2030-01-01'),
 ('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002','reconcile-target','2030-01-01'),
 ('e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000003','reconcile-other','2030-01-01'),
 ('e2000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000004','create-source','2030-01-01'),
 ('e2000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000005','create-target','2030-01-01'),
 ('e2000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000007','legacy-target','2030-01-01');
-- An upgraded held claim predates the attempt trigger, so it has no witness.
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,expires_at,claimed_at)
VALUES ('e2000000-0000-4000-8000-000000000006','e1000000-0000-4000-8000-000000000006','legacy-source','2030-01-01',now());
INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data)
VALUES ('e3000000-0000-4000-8000-000000000001','recovery@example.test','prior-hash','{"retained":"yes"}');

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.account_setup_attempts'::regclass), 'attempt ledger has RLS');
SELECT ok(NOT has_table_privilege('anon','public.account_setup_attempts','SELECT,INSERT,UPDATE,DELETE')
 AND NOT has_table_privilege('authenticated','public.account_setup_attempts','SELECT,INSERT,UPDATE,DELETE'),
 'browser roles cannot read or write setup attempts');
SELECT ok(has_table_privilege('service_role','public.account_setup_attempts','SELECT')
 AND NOT has_table_privilege('service_role','public.account_setup_attempts','INSERT,UPDATE,DELETE'),
 'service role can read marker but cannot bypass admission with direct writes');
SELECT ok(NOT has_function_privilege('authenticated','public.reconcile_account_setup_claim(uuid,uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.complete_account_setup_recovery(uuid,uuid,uuid,text,text)','EXECUTE'),
 'recovery RPCs are not browser callable');
SET LOCAL ROLE authenticated;
SELECT throws_ok('SELECT * FROM public.account_setup_attempts','42501',NULL,'browser ledger read denied');
SELECT throws_ok($$SELECT public.reconcile_account_setup_claim('e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002')$$,
 '42501',NULL,'browser recovery RPC denied');
RESET ROLE;

SELECT is(public.reconcile_account_setup_claim('e2000000-0000-4000-8000-000000000007','e1000000-0000-4000-8000-000000000007')->>'state',
 'support-required','historical held claim stays staff-only');
SELECT is((SELECT failed_at FROM public.account_setup_links WHERE id='e2000000-0000-4000-8000-000000000006'),NULL::timestamptz,
 'historical claim remains held');

SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
 'e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',now())),
 'claim-started','approved source claim starts');
RESET ROLE;
SELECT is((SELECT state FROM public.account_setup_attempts WHERE setup_link_id='e2000000-0000-4000-8000-000000000001'),
 'started','claim atomically created a witness');
SELECT is((SELECT normalized_email FROM public.account_setup_attempts WHERE setup_link_id='e2000000-0000-4000-8000-000000000001'),
 'recovery@example.test','witness uses stored normalized email');
SELECT throws_ok($$UPDATE public.access_requests SET email='moved@example.test'
 WHERE id='e1000000-0000-4000-8000-000000000001'$$,
 '23514','Access Request email cannot change after approval or setup-link issuance',
 'approved request cannot move a held claim to another email while Auth may be writing');
SELECT is((SELECT email FROM public.access_requests WHERE id='e1000000-0000-4000-8000-000000000001'),
 'recovery@example.test','held request retains the email witnessed at claim');
CREATE TEMP TABLE old_marker AS SELECT id FROM public.account_setup_attempts
 WHERE setup_link_id='e2000000-0000-4000-8000-000000000001';
SELECT throws_ok($$UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data ||
 jsonb_build_object('ttt_setup_attempt',(SELECT id FROM old_marker))
 WHERE id='e3000000-0000-4000-8000-000000000001'$$,
 '42501','Account setup password witness missing','metadata alone cannot confirm an existing-user password');
SELECT is(public.reconcile_account_setup_claim('e2000000-0000-4000-8000-000000000003',
 'e1000000-0000-4000-8000-000000000003')->>'state','clear','other email has no held claim');
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
 'e2000000-0000-4000-8000-000000000003','e1000000-0000-4000-8000-000000000003',now())),
 'claim-started','new-user attempt can be claimed');
RESET ROLE;
CREATE TEMP TABLE create_old_marker AS SELECT id FROM public.account_setup_attempts
 WHERE setup_link_id='e2000000-0000-4000-8000-000000000003';
SELECT is(public.reconcile_account_setup_claim('e2000000-0000-4000-8000-000000000003',
 'e1000000-0000-4000-8000-000000000003')->>'state','fenced',
 'same-link recovery fences uncertain create and requires a fresh link');
SELECT throws_ok($$INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data)
 VALUES ('e3000000-0000-4000-8000-000000000003','other@example.test','late-create-hash',
 jsonb_build_object('ttt_setup_attempt',(SELECT id FROM create_old_marker)))$$,
 '42501','Account setup attempt fenced','late new-user INSERT rolls back');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id='e3000000-0000-4000-8000-000000000003'),
 0,'fenced create left no Auth user');
SELECT is(public.reconcile_account_setup_claim('e2000000-0000-4000-8000-000000000002',
 'e1000000-0000-4000-8000-000000000002')->>'state','fenced','new link fences uncommitted source');
SELECT is((SELECT state FROM public.account_setup_attempts WHERE setup_link_id='e2000000-0000-4000-8000-000000000001'),
 'fenced','fence is durable');
SELECT is((SELECT failure_reason FROM public.account_setup_links WHERE id='e2000000-0000-4000-8000-000000000001'),
 'reconciled-no-write','fenced source releases email hold');
SELECT throws_ok($$UPDATE auth.users SET encrypted_password='late-hash',raw_user_meta_data=raw_user_meta_data ||
 jsonb_build_object('ttt_setup_attempt',(SELECT id FROM old_marker))
 WHERE id='e3000000-0000-4000-8000-000000000001'$$,
 '42501','Account setup attempt fenced','late existing-user password write rolls back');
SELECT is((SELECT encrypted_password FROM auth.users WHERE id='e3000000-0000-4000-8000-000000000001'),
 'prior-hash','fenced update retains prior password');
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
 'e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002',now())),
 'claim-started','new link admits password only after fence');
RESET ROLE;
UPDATE auth.users SET encrypted_password='confirmed-hash' WHERE id='e3000000-0000-4000-8000-000000000001';
UPDATE auth.users SET raw_user_meta_data=raw_user_meta_data || jsonb_build_object('ttt_setup_attempt',
 (SELECT id FROM public.account_setup_attempts WHERE setup_link_id='e2000000-0000-4000-8000-000000000002'))
 WHERE id='e3000000-0000-4000-8000-000000000001';
SELECT is((SELECT state FROM public.account_setup_attempts WHERE setup_link_id='e2000000-0000-4000-8000-000000000002'),
 'committed','password and marker commit together');
SELECT is((SELECT raw_user_meta_data FROM auth.users WHERE id='e3000000-0000-4000-8000-000000000001'),
 '{"retained":"yes"}'::jsonb,'marker consumed without deleting other metadata');
SELECT is(public.reconcile_account_setup_claim('e2000000-0000-4000-8000-000000000002',
 'e1000000-0000-4000-8000-000000000002')->>'state','committed','lost Auth response reconciles without password rewrite');
UPDATE public.access_requests SET setup_completed_at=now(),
 setup_user_id='e3000000-0000-4000-8000-000000000001'
 WHERE id='e1000000-0000-4000-8000-000000000002';
SELECT is(public.reconcile_account_setup_claim('e2000000-0000-4000-8000-000000000002',
 'e1000000-0000-4000-8000-000000000002')->>'state','committed',
 'request completion without link completion remains recoverable');
SELECT is(public.complete_account_setup_recovery('e2000000-0000-4000-8000-000000000002',
 'e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002')->>'state',
 'completed','same valid claimed link finalizes witnessed update');
SELECT is(public.complete_account_setup_recovery('e2000000-0000-4000-8000-000000000002',
 'e2000000-0000-4000-8000-000000000002','e1000000-0000-4000-8000-000000000002')->>'state',
 'completed','repeated finalization is idempotent');
SELECT is((SELECT setup_user_id FROM public.access_requests WHERE id='e1000000-0000-4000-8000-000000000002'),
 'e3000000-0000-4000-8000-000000000001'::uuid,'request linked to witnessed user');

-- A new Auth user is confirmed by the INSERT itself. A later replacement of
-- the source link does not erase the committed password or block finalization.
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
 'e2000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000004',now())),
 'claim-started','new-user source claim starts');
RESET ROLE;
SELECT throws_ok($$INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data)
 VALUES ('e3000000-0000-4000-8000-000000000004','wrong@example.test','wrong-hash',
 jsonb_build_object('ttt_setup_attempt',(SELECT id FROM public.account_setup_attempts
  WHERE setup_link_id='e2000000-0000-4000-8000-000000000004')))$$,
 '42501','Account setup attempt fenced','create marker cannot be used for a different email');
SAVEPOINT create_provider_rollback;
INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data) VALUES
 ('e3000000-0000-4000-8000-000000000002','new@example.test','new-hash',
  jsonb_build_object('ttt_setup_attempt',(SELECT id FROM public.account_setup_attempts
   WHERE setup_link_id='e2000000-0000-4000-8000-000000000004')));
SELECT is((SELECT state FROM public.account_setup_attempts WHERE setup_link_id='e2000000-0000-4000-8000-000000000004'),
 'committed','Auth INSERT confirms inside provider transaction');
ROLLBACK TO create_provider_rollback;
SELECT is((SELECT state FROM public.account_setup_attempts WHERE setup_link_id='e2000000-0000-4000-8000-000000000004'),
 'started','provider rollback also rolls back create confirmation');
INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data) VALUES
 ('e3000000-0000-4000-8000-000000000002','new@example.test','new-hash',
  jsonb_build_object('ttt_setup_attempt',(SELECT id FROM public.account_setup_attempts
   WHERE setup_link_id='e2000000-0000-4000-8000-000000000004'),'retained','new'));
SELECT is((SELECT state FROM public.account_setup_attempts WHERE setup_link_id='e2000000-0000-4000-8000-000000000004'),
 'committed','new-user INSERT records Auth commit');
SELECT is((SELECT raw_user_meta_data FROM auth.users WHERE id='e3000000-0000-4000-8000-000000000002'),
 '{"retained":"new"}'::jsonb,'new-user marker consumed');
UPDATE public.account_setup_links SET revoked_at=now(),revocation_reason='replaced'
 WHERE id='e2000000-0000-4000-8000-000000000004';
SELECT is(public.reconcile_account_setup_claim('e2000000-0000-4000-8000-000000000005',
 'e1000000-0000-4000-8000-000000000005')->>'state','committed',
 'fresh approved same-email link sees committed source despite its revocation');
UPDATE public.access_requests SET setup_user_id='e3000000-0000-4000-8000-000000000001'
 WHERE id='e1000000-0000-4000-8000-000000000005';
SELECT is(public.complete_account_setup_recovery('e2000000-0000-4000-8000-000000000004',
 'e2000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000005',
 'New','Person')->>'state',
 'support-required','partial target tracking with a different user requires staff');
SELECT is((SELECT setup_user_id FROM public.access_requests
 WHERE id='e1000000-0000-4000-8000-000000000005'),
 'e3000000-0000-4000-8000-000000000001'::uuid,
 'denied partial-state recovery preserves the prior user ID');
SELECT is((SELECT count(*)::integer FROM public.user_profiles
 WHERE user_id='e3000000-0000-4000-8000-000000000002'),0,
 'denied partial-state recovery does not create a profile');
UPDATE public.access_requests SET setup_user_id=NULL
 WHERE id='e1000000-0000-4000-8000-000000000005';
CREATE FUNCTION pg_temp.reject_recovery_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic profile failure' USING ERRCODE = 'P0001'; END;
$$;
CREATE TRIGGER reject_recovery_profile BEFORE INSERT ON public.user_profiles
 FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_recovery_profile();
SELECT throws_ok($$SELECT public.complete_account_setup_recovery(
 'e2000000-0000-4000-8000-000000000004',
 'e2000000-0000-4000-8000-000000000005',
 'e1000000-0000-4000-8000-000000000005','New','Person')$$,
 'P0001','synthetic profile failure','profile failure rolls back recovery transaction');
SELECT is((SELECT count(*)::integer FROM public.access_requests WHERE id IN
 ('e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000005')
 AND setup_completed_at IS NOT NULL),0,'profile failure leaves both requests incomplete');
SELECT is((SELECT count(*)::integer FROM public.account_setup_links WHERE id IN
 ('e2000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000005')
 AND used_at IS NOT NULL),0,'profile failure leaves both links unconsumed');
DROP TRIGGER reject_recovery_profile ON public.user_profiles;
CREATE FUNCTION pg_temp.reject_recovery_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic request failure' USING ERRCODE = 'P0001'; END;
$$;
CREATE TRIGGER reject_recovery_request BEFORE UPDATE OF setup_completed_at ON public.access_requests
 FOR EACH ROW WHEN (NEW.id = 'e1000000-0000-4000-8000-000000000005')
 EXECUTE FUNCTION pg_temp.reject_recovery_request();
SELECT throws_ok($$SELECT public.complete_account_setup_recovery(
 'e2000000-0000-4000-8000-000000000004',
 'e2000000-0000-4000-8000-000000000005',
 'e1000000-0000-4000-8000-000000000005','New','Person')$$,
 'P0001','synthetic request failure','request update failure rolls back recovery transaction');
SELECT is((SELECT count(*)::integer FROM public.user_profiles
 WHERE user_id='e3000000-0000-4000-8000-000000000002'),0,
 'request update failure rolls back profile');
SELECT is((SELECT count(*)::integer FROM public.access_requests WHERE id IN
 ('e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000005')
 AND setup_completed_at IS NOT NULL),0,'request update failure leaves both requests incomplete');
SELECT is((SELECT count(*)::integer FROM public.account_setup_links WHERE id IN
 ('e2000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000005')
 AND used_at IS NOT NULL),0,'request update failure leaves both links unconsumed');
DROP TRIGGER reject_recovery_request ON public.access_requests;
CREATE FUNCTION pg_temp.reject_recovery_link() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic link failure' USING ERRCODE = 'P0001'; END;
$$;
CREATE TRIGGER reject_recovery_link BEFORE UPDATE OF used_at ON public.account_setup_links
 FOR EACH ROW WHEN (NEW.id = 'e2000000-0000-4000-8000-000000000005')
 EXECUTE FUNCTION pg_temp.reject_recovery_link();
SELECT throws_ok($$SELECT public.complete_account_setup_recovery(
 'e2000000-0000-4000-8000-000000000004',
 'e2000000-0000-4000-8000-000000000005',
 'e1000000-0000-4000-8000-000000000005','New','Person')$$,
 'P0001','synthetic link failure','link update failure rolls back recovery transaction');
SELECT is((SELECT count(*)::integer FROM public.user_profiles
 WHERE user_id='e3000000-0000-4000-8000-000000000002'),0,
 'link update failure rolls back profile');
SELECT is((SELECT count(*)::integer FROM public.access_requests WHERE id IN
 ('e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000005')
 AND setup_completed_at IS NOT NULL),0,'link update failure rolls back both requests');
SELECT is((SELECT count(*)::integer FROM public.account_setup_links WHERE id IN
 ('e2000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000005')
 AND used_at IS NOT NULL),0,'link update failure leaves both links unconsumed');
DROP TRIGGER reject_recovery_link ON public.account_setup_links;
SELECT is(public.complete_account_setup_recovery('e2000000-0000-4000-8000-000000000004',
 'e2000000-0000-4000-8000-000000000005','e1000000-0000-4000-8000-000000000005',
 'New','Person')->>'state',
 'completed','one transaction finalizes source and target requests without another password');
SELECT is((SELECT first_name || ' ' || last_name FROM public.user_profiles
 WHERE user_id='e3000000-0000-4000-8000-000000000002'),'New Person',
 'successful recovery creates profile in the same transaction');
SELECT is((SELECT count(*)::integer FROM public.access_requests WHERE id IN
 ('e1000000-0000-4000-8000-000000000004','e1000000-0000-4000-8000-000000000005')
 AND setup_user_id='e3000000-0000-4000-8000-000000000002' AND setup_completed_at IS NOT NULL),
 2,'both approved requests can advance with the same witnessed user');
SELECT is((SELECT count(*)::integer FROM public.account_setup_links WHERE id IN
 ('e2000000-0000-4000-8000-000000000004','e2000000-0000-4000-8000-000000000005')
 AND claimed_at IS NOT NULL AND used_at IS NOT NULL),2,'source and target links are consumed');

-- If Auth's email changes after the witnessed write, old-email setup proof
-- cannot finalize that user even though the original marker still committed.
INSERT INTO public.access_requests(id,email,name,status) VALUES
 ('e1000000-0000-4000-8000-000000000008','changed@example.test','Changed Source','approved'),
 ('e1000000-0000-4000-8000-000000000009','changed@example.test','Changed Target','approved');
INSERT INTO public.account_setup_links(id,access_request_id,token_hash,expires_at) VALUES
 ('e2000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000008','changed-source','2030-01-01'),
 ('e2000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000009','changed-target','2030-01-01');
SET LOCAL ROLE service_role;
SELECT is((SELECT claim_status FROM public.claim_account_setup_link_for_session(
 'e2000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000008',now())),
 'claim-started','changed-email source claim starts');
RESET ROLE;
INSERT INTO auth.users(id,email,encrypted_password,raw_user_meta_data) VALUES
 ('e3000000-0000-4000-8000-000000000008','changed@example.test','changed-hash',
 jsonb_build_object('ttt_setup_attempt',(SELECT id FROM public.account_setup_attempts
  WHERE setup_link_id='e2000000-0000-4000-8000-000000000008')));
UPDATE auth.users SET email='moved@example.test' WHERE id='e3000000-0000-4000-8000-000000000008';
SELECT is(public.complete_account_setup_recovery('e2000000-0000-4000-8000-000000000008',
 'e2000000-0000-4000-8000-000000000009','e1000000-0000-4000-8000-000000000009',
 'Stale','Name')->>'state',
 'support-required','changed Auth email prevents old-email setup completion');
SELECT is((SELECT count(*)::integer FROM public.user_profiles
 WHERE user_id='e3000000-0000-4000-8000-000000000008'),0,
 'denied changed-email recovery creates no stale profile');
SELECT is((SELECT count(*)::integer FROM public.access_requests WHERE id IN
 ('e1000000-0000-4000-8000-000000000008','e1000000-0000-4000-8000-000000000009')
 AND setup_completed_at IS NOT NULL),0,'changed-email denial leaves requests incomplete');

SELECT * FROM finish();
ROLLBACK;
