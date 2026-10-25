BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT plan(54);

-- Global content and account dismissals do not require Organization membership.
-- Active/expiry filtering and admitted identity are application responsibilities;
-- these checks exercise the existing provider permissions, not those policies.
INSERT INTO auth.users (
	instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
	raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
	'00000000-0000-0000-0000-000000000000'::uuid,
	fixture.id::uuid,
	'authenticated', 'authenticated', fixture.email, '', now(),
	'{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
FROM (VALUES
	('10000000-0000-4000-8000-000000136801', 'communications-no-membership@example.test'),
	('10000000-0000-4000-8000-000000136802', 'communications-alpha-owner@example.test'),
	('10000000-0000-4000-8000-000000136803', 'communications-content-author@example.test'),
	('10000000-0000-4000-8000-000000136804', 'communications-support@example.test'),
	('10000000-0000-4000-8000-000000136805', 'communications-bravo-owner@example.test'),
	('10000000-0000-4000-8000-000000136806', 'communications-inactive-support@example.test'),
	('10000000-0000-4000-8000-000000136807', 'communications-alpha-peer@example.test')
) AS fixture(id, email);

INSERT INTO public.platform_operators(user_id) VALUES
 ('10000000-0000-4000-8000-000000136803'),
 ('10000000-0000-4000-8000-000000136804');

INSERT INTO public.organizations (id, name, created_by, url_slug)
VALUES
	('20000000-0000-4000-8000-000000136801', 'Communications Alpha', '10000000-0000-4000-8000-000000136803', 'communications-alpha-1368'),
	('20000000-0000-4000-8000-000000136802', 'Communications Bravo', '10000000-0000-4000-8000-000000136803', 'communications-bravo-1368');

INSERT INTO public.organization_memberships (
	id, organization_id, user_id, role, member_preset, capability_overrides,
	access_scope_kind, access_scope_group_ids, email
)
SELECT
	fixture.id::uuid, fixture.org_id::uuid, fixture.user_id::uuid,
	fixture.role::public.organization_role, 'viewer', '{}'::jsonb,
	'organization', ARRAY[]::uuid[], fixture.email
FROM (VALUES
	('30000000-0000-4000-8000-000000136801', '20000000-0000-4000-8000-000000136801', '10000000-0000-4000-8000-000000136802', 'owner', 'communications-alpha-owner@example.test'),
	('30000000-0000-4000-8000-000000136802', '20000000-0000-4000-8000-000000136801', '10000000-0000-4000-8000-000000136807', 'member', 'communications-alpha-peer@example.test'),
	('30000000-0000-4000-8000-000000136803', '20000000-0000-4000-8000-000000136802', '10000000-0000-4000-8000-000000136805', 'owner', 'communications-bravo-owner@example.test')
) AS fixture(id, org_id, user_id, role, email);

INSERT INTO public.notifications (id, user_id, organization_id, type, title, message)
VALUES
	('60000000-0000-4000-8000-000000136801', '10000000-0000-4000-8000-000000136802', '20000000-0000-4000-8000-000000136801', 'training', 'Own Alpha notification', 'Own Alpha message'),
	('60000000-0000-4000-8000-000000136802', '10000000-0000-4000-8000-000000136807', '20000000-0000-4000-8000-000000136801', 'training', 'Peer Alpha notification', 'Peer Alpha message'),
	('60000000-0000-4000-8000-000000136803', '10000000-0000-4000-8000-000000136802', '20000000-0000-4000-8000-000000136802', 'training', 'Own Bravo notification', 'Own Bravo message'),
	('60000000-0000-4000-8000-000000136804', '10000000-0000-4000-8000-000000136802', '20000000-0000-4000-8000-000000136801', 'training', 'Anonymous deletion witness', 'Saved own Alpha message'),
	('60000000-0000-4000-8000-000000136805', '10000000-0000-4000-8000-000000136805', '20000000-0000-4000-8000-000000136802', 'training', 'Peer Bravo notification', 'Peer Bravo message');

INSERT INTO public.platform_announcements (id, title, message, is_active, expires_at, created_by)
VALUES
	('40000000-0000-4000-8000-000000136801', 'Global active', 'Active content', true, NULL, '10000000-0000-4000-8000-000000136803'),
	('40000000-0000-4000-8000-000000136802', 'Global inactive', 'Inactive content', false, NULL, '10000000-0000-4000-8000-000000136803'),
	('40000000-0000-4000-8000-000000136803', 'Global expired', 'Expired content', true, now() - interval '1 day', '10000000-0000-4000-8000-000000136803');

INSERT INTO public.announcement_dismissals (announcement_id, user_id, dismissed_at)
VALUES ('40000000-0000-4000-8000-000000136803', '10000000-0000-4000-8000-000000136802', '2026-01-01T00:00:00Z');

INSERT INTO public.beta_feedback (id, user_id, user_email, organization_id, organization_name, category, message)
VALUES
	('50000000-0000-4000-8000-000000136801', '10000000-0000-4000-8000-000000136802', 'communications-alpha-owner@example.test', '20000000-0000-4000-8000-000000136801', 'Communications Alpha', 'general', 'Alpha owner feedback'),
	('50000000-0000-4000-8000-000000136802', '10000000-0000-4000-8000-000000136807', 'communications-alpha-peer@example.test', '20000000-0000-4000-8000-000000136801', 'Communications Alpha', 'bug', 'Alpha peer feedback'),
	('50000000-0000-4000-8000-000000136803', '10000000-0000-4000-8000-000000136805', 'communications-bravo-owner@example.test', '20000000-0000-4000-8000-000000136802', 'Communications Bravo', 'feature', 'Bravo owner feedback');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000136801', true);

SELECT results_eq(
	$$ SELECT id FROM public.platform_announcements ORDER BY id $$,
	$$ VALUES ('40000000-0000-4000-8000-000000136801'::uuid), ('40000000-0000-4000-8000-000000136802'::uuid), ('40000000-0000-4000-8000-000000136803'::uuid) $$,
	'authenticated account without membership can read global active, inactive and expired content'
);

SELECT throws_ok(
	$$ INSERT INTO public.platform_announcements (title, message, created_by)
	VALUES ('Unauthorized content', 'Blocked insert', '10000000-0000-4000-8000-000000136801') $$,
	'42501', NULL, 'ordinary account cannot create announcement content'
);

SELECT throws_ok(
	$$ UPDATE public.platform_announcements SET title = 'Blocked change'
	WHERE id = '40000000-0000-4000-8000-000000136801' $$,
	'42501', NULL, 'ordinary account cannot update content'
);

SELECT throws_ok(
	$$ DELETE FROM public.platform_announcements
	WHERE id = '40000000-0000-4000-8000-000000136801' $$,
	'42501', NULL, 'ordinary account cannot delete content'
);

SELECT lives_ok(
	$$ INSERT INTO public.announcement_dismissals (announcement_id, user_id)
	VALUES ('40000000-0000-4000-8000-000000136801', '10000000-0000-4000-8000-000000136801') $$,
	'account without membership can dismiss global content'
);

SELECT lives_ok(
	$$ INSERT INTO public.announcement_dismissals (announcement_id, user_id)
	VALUES ('40000000-0000-4000-8000-000000136801', '10000000-0000-4000-8000-000000136801')
	ON CONFLICT (announcement_id, user_id) DO UPDATE SET user_id = EXCLUDED.user_id $$,
	'repeated own dismissal permits the existing upsert'
);

SELECT results_eq(
	$$ SELECT announcement_id FROM public.announcement_dismissals ORDER BY announcement_id $$,
	$$ VALUES ('40000000-0000-4000-8000-000000136801'::uuid) $$,
	'repeated dismissal stays one row and another account dismissal is concealed'
);

SELECT throws_ok(
	$$ INSERT INTO public.announcement_dismissals (announcement_id, user_id)
	VALUES ('40000000-0000-4000-8000-000000136802', '10000000-0000-4000-8000-000000136802') $$,
	'42501', NULL, 'account cannot insert a dismissal attributed to a peer'
);

SELECT throws_ok(
	$$ UPDATE public.announcement_dismissals SET user_id = '10000000-0000-4000-8000-000000136805'
	WHERE announcement_id = '40000000-0000-4000-8000-000000136801' $$,
	'42501', NULL, 'account cannot reassign its dismissal to another account'
);

WITH changed AS (
	UPDATE public.announcement_dismissals SET dismissed_at = '2030-01-01T00:00:00Z'
	WHERE announcement_id = '40000000-0000-4000-8000-000000136803' RETURNING announcement_id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'account cannot update a concealed peer dismissal');

WITH removed AS (
	DELETE FROM public.announcement_dismissals
	WHERE announcement_id = '40000000-0000-4000-8000-000000136803' RETURNING announcement_id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'account cannot delete a concealed peer dismissal');

SELECT throws_ok(
	$$ INSERT INTO public.announcement_dismissals (announcement_id, user_id)
	VALUES ('40000000-0000-4000-8000-000000136899', '10000000-0000-4000-8000-000000136801') $$,
	'23503', NULL, 'own dismissal cannot reference missing announcement content'
);

SELECT lives_ok(
	$$ INSERT INTO public.announcement_dismissals (announcement_id, user_id)
	VALUES ('40000000-0000-4000-8000-000000136802', '10000000-0000-4000-8000-000000136801') $$,
	'existing inactive content remains dismissible at the provider boundary'
);

WITH removed AS (
	DELETE FROM public.announcement_dismissals
	WHERE announcement_id = '40000000-0000-4000-8000-000000136802' RETURNING announcement_id
)
SELECT is((SELECT count(*)::integer FROM removed), 1, 'account can delete its own dismissal');

SELECT lives_ok(
	$$ INSERT INTO public.beta_feedback (id, user_id, user_email, message)
	VALUES ('50000000-0000-4000-8000-000000136805', '10000000-0000-4000-8000-000000136801', 'communications-no-membership@example.test', 'Account-only feedback') $$,
	'account without membership can submit feedback without Organization context'
);

SELECT throws_ok(
	$$ INSERT INTO public.beta_feedback (user_id, user_email, message)
	VALUES ('10000000-0000-4000-8000-000000136802', 'communications-alpha-owner@example.test', 'Spoofed submitter') $$,
	'42501', NULL, 'ordinary account cannot attribute feedback to a peer'
);

RESET ROLE;
SELECT results_eq(
	$$ SELECT announcement_id, user_id, dismissed_at FROM public.announcement_dismissals
	WHERE announcement_id = '40000000-0000-4000-8000-000000136803' $$,
	$$ VALUES ('40000000-0000-4000-8000-000000136803'::uuid, '10000000-0000-4000-8000-000000136802'::uuid, '2026-01-01T00:00:00Z'::timestamptz) $$,
	'denied updates and deletes preserve the peer dismissal'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000136802', true);

SELECT lives_ok(
	$$ INSERT INTO public.announcement_dismissals (announcement_id, user_id)
	VALUES ('40000000-0000-4000-8000-000000136801', '10000000-0000-4000-8000-000000136802') $$,
	'peer account can independently dismiss the same global announcement'
);

SELECT results_eq(
	$$ SELECT announcement_id FROM public.announcement_dismissals ORDER BY announcement_id $$,
	$$ VALUES ('40000000-0000-4000-8000-000000136801'::uuid), ('40000000-0000-4000-8000-000000136803'::uuid) $$,
	'peer sees only its own separate global dismissals'
);

WITH removed AS (
	DELETE FROM public.notifications
	WHERE id = '60000000-0000-4000-8000-000000136801' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 1, 'account can delete its own notification in its Organization');

WITH removed AS (
	DELETE FROM public.notifications
	WHERE id = '60000000-0000-4000-8000-000000136802' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'Organization owner cannot delete a same-Organization peer notification');

WITH removed AS (
	DELETE FROM public.notifications
	WHERE id = '60000000-0000-4000-8000-000000136805' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'account cannot delete a foreign-Organization peer notification');

-- Notification DELETE RLS checks account identity, even without membership in
-- the saved Organization. The application operation separately restricts the
-- requested Organization; do not invent that restriction in the SQL policy.
WITH removed AS (
	DELETE FROM public.notifications
	WHERE id = '60000000-0000-4000-8000-000000136803' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 1, 'current provider permits deletion of the same account notification in another Organization');

SELECT results_eq(
	$$ SELECT id FROM public.beta_feedback WHERE organization_id = '20000000-0000-4000-8000-000000136801' ORDER BY id $$,
	$$ VALUES ('50000000-0000-4000-8000-000000136801'::uuid) $$,
	'Organization owner request-client export can read only its own feedback, not its same-Organization peer'
);

SELECT is(
	(SELECT count(*)::integer FROM public.beta_feedback WHERE id = '50000000-0000-4000-8000-000000136803'),
	0, 'Organization owner cannot read foreign account feedback'
);

-- Feedback RLS binds the submitting account, not its Organization membership.
-- The feedback submission operation separately rejects foreign Organization context.
SELECT lives_ok(
	$$ INSERT INTO public.beta_feedback (id, user_id, user_email, organization_id, organization_name, message)
	VALUES ('50000000-0000-4000-8000-000000136804', '10000000-0000-4000-8000-000000136802', 'communications-alpha-owner@example.test', '20000000-0000-4000-8000-000000136802', 'Communications Bravo', 'Raw own feedback with foreign context') $$,
	'current feedback provider policy checks own submitter without imposing Organization membership'
);

SELECT results_eq(
	$$ SELECT id FROM public.beta_feedback ORDER BY id $$,
	$$ VALUES ('50000000-0000-4000-8000-000000136801'::uuid), ('50000000-0000-4000-8000-000000136804'::uuid) $$,
	'own feedback remains account-scoped across Organization contexts'
);

WITH changed AS (
	UPDATE public.beta_feedback SET status = 'resolved'
	WHERE id = '50000000-0000-4000-8000-000000136801' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'submitter cannot review or change its own feedback');

WITH removed AS (
	DELETE FROM public.beta_feedback
	WHERE id = '50000000-0000-4000-8000-000000136801' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'submitter cannot delete feedback');

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT lives_ok(
	$$ INSERT INTO public.beta_feedback (id, user_id, user_email, organization_id, organization_name, message)
	VALUES ('50000000-0000-4000-8000-000000136806', '10000000-0000-4000-8000-000000136805', 'communications-bravo-owner@example.test', '20000000-0000-4000-8000-000000136802', 'Communications Bravo', 'Privileged submission persistence') $$,
	'server service-role submission can persist the admitted submitter without an end-user JWT'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000136804', true);
SELECT set_config('request.jwt.claims', '{"aal":"aal2"}', true);

SELECT results_eq(
	$$ SELECT id FROM public.beta_feedback ORDER BY id $$,
	$$ VALUES ('50000000-0000-4000-8000-000000136801'::uuid), ('50000000-0000-4000-8000-000000136802'::uuid), ('50000000-0000-4000-8000-000000136803'::uuid), ('50000000-0000-4000-8000-000000136804'::uuid), ('50000000-0000-4000-8000-000000136805'::uuid), ('50000000-0000-4000-8000-000000136806'::uuid) $$,
	'operator reads feedback across accounts and Organizations'
);

SELECT lives_ok(
 $$ SELECT public.reply_to_feedback('50000000-0000-4000-8000-000000136802', 'Support acknowledgement', false) $$,
 'operator can review feedback through its attributed reply command'
);
SELECT lives_ok(
 $$ SELECT public.save_feedback_staff_note('50000000-0000-4000-8000-000000136802', 'Support triage') $$,
 'operator can save a staff-only note through its attributed command'
);

-- Banner writes belong to the server command, which binds attribution and awaits the audit row.
SELECT throws_ok(
	$$ INSERT INTO public.platform_announcements (id, title, message, created_by)
	VALUES ('40000000-0000-4000-8000-000000136804', 'Support-created content', 'Direct write', '10000000-0000-4000-8000-000000136804') $$,
	'42501', NULL, 'operator clients cannot insert content directly'
);

SELECT throws_ok(
	$$ UPDATE public.platform_announcements SET is_active = false
	WHERE id = '40000000-0000-4000-8000-000000136801' $$,
	'42501', NULL, 'operator clients cannot update content directly'
);

SELECT throws_ok(
	$$ DELETE FROM public.platform_announcements
	WHERE id = '40000000-0000-4000-8000-000000136801' $$,
	'42501', NULL, 'operator clients cannot delete content directly'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000136806', true);
SELECT is((SELECT count(*)::integer FROM public.beta_feedback), 0, 'non-operator cannot read others feedback');

WITH changed AS (
	UPDATE public.beta_feedback SET status = 'resolved'
	WHERE id = '50000000-0000-4000-8000-000000136802' RETURNING id
)
SELECT is((SELECT count(*)::integer FROM changed), 0, 'non-operator cannot review feedback');

SELECT throws_ok(
	$$ INSERT INTO public.platform_announcements (title, message, created_by)
	VALUES ('Inactive admin content', 'Blocked', '10000000-0000-4000-8000-000000136806') $$,
	'42501', NULL, 'non-operator cannot create content'
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT is((SELECT count(*)::integer FROM public.platform_announcements), 0, 'anonymous caller cannot read global content');
SELECT is((SELECT count(*)::integer FROM public.announcement_dismissals), 0, 'anonymous caller cannot read account dismissals');
SELECT is((SELECT count(*)::integer FROM public.beta_feedback), 0, 'anonymous caller cannot read feedback');

WITH removed AS (
	DELETE FROM public.notifications RETURNING id
)
SELECT is((SELECT count(*)::integer FROM removed), 0, 'anonymous caller cannot delete account notifications');

SELECT throws_ok(
	$$ INSERT INTO public.announcement_dismissals (announcement_id, user_id)
	VALUES ('40000000-0000-4000-8000-000000136802', '10000000-0000-4000-8000-000000136801') $$,
	'42501', NULL, 'anonymous caller cannot create an account dismissal'
);

SELECT throws_ok(
	$$ INSERT INTO public.beta_feedback (user_id, user_email, message)
	VALUES ('10000000-0000-4000-8000-000000136801', 'communications-no-membership@example.test', 'Anonymous spoof') $$,
	'42501', NULL, 'anonymous caller cannot create feedback for an existing account'
);

RESET ROLE;
SELECT results_eq(
	$$ SELECT coalesce(link, id::text) FROM public.notifications ORDER BY 1 $$,
	$$ VALUES ('/feedback/50000000-0000-4000-8000-000000136802'::text), ('60000000-0000-4000-8000-000000136802'::text), ('60000000-0000-4000-8000-000000136804'::text), ('60000000-0000-4000-8000-000000136805'::text) $$,
	'own deletions persist while denied peer and anonymous deletes preserve saved and reply notifications'
);

SELECT results_eq(
	$$ SELECT f.status, n.body FROM public.beta_feedback f LEFT JOIN public.feedback_staff_notes n ON n.feedback_id=f.id WHERE f.id = '50000000-0000-4000-8000-000000136801' $$,
	$$ VALUES ('new'::text, NULL::text) $$,
	'denied submitter review and deletion preserve the saved feedback'
);

SELECT results_eq(
	$$ SELECT f.status, n.body FROM public.beta_feedback f LEFT JOIN public.feedback_staff_notes n ON n.feedback_id=f.id WHERE f.id = '50000000-0000-4000-8000-000000136802' $$,
	$$ VALUES ('reviewed'::text, 'Support triage'::text) $$,
	'denied inactive reviewer leaves the support review intact'
);

INSERT INTO public.announcement_dismissals (announcement_id, user_id)
VALUES
	('40000000-0000-4000-8000-000000136802', '10000000-0000-4000-8000-000000136801'),
	('40000000-0000-4000-8000-000000136802', '10000000-0000-4000-8000-000000136802');

SET LOCAL ROLE service_role;
SELECT lives_ok(
	$$ DELETE FROM public.platform_announcements WHERE id = '40000000-0000-4000-8000-000000136801' $$,
	'server content deletion succeeds with account dismissals present'
);

RESET ROLE;
SELECT is(
	(SELECT count(*)::integer FROM public.announcement_dismissals WHERE announcement_id = '40000000-0000-4000-8000-000000136801'),
	0, 'content deletion cascades dismissals for every account'
);

SELECT results_eq(
	$$ SELECT announcement_id, user_id FROM public.announcement_dismissals ORDER BY announcement_id, user_id $$,
	$$ VALUES
	('40000000-0000-4000-8000-000000136802'::uuid, '10000000-0000-4000-8000-000000136801'::uuid),
	('40000000-0000-4000-8000-000000136802'::uuid, '10000000-0000-4000-8000-000000136802'::uuid),
	('40000000-0000-4000-8000-000000136803'::uuid, '10000000-0000-4000-8000-000000136802'::uuid) $$,
	'content deletion preserves dismissals of other announcements'
);

DELETE FROM auth.users WHERE id = '10000000-0000-4000-8000-000000136801';
SELECT results_eq(
	$$ SELECT announcement_id, user_id FROM public.announcement_dismissals ORDER BY announcement_id, user_id $$,
	$$ VALUES
	('40000000-0000-4000-8000-000000136802'::uuid, '10000000-0000-4000-8000-000000136802'::uuid),
	('40000000-0000-4000-8000-000000136803'::uuid, '10000000-0000-4000-8000-000000136802'::uuid) $$,
	'account deletion cascades only its dismissals and preserves the peer'
);

SELECT results_eq(
	$$ SELECT id FROM public.beta_feedback ORDER BY id $$,
	$$ VALUES ('50000000-0000-4000-8000-000000136801'::uuid), ('50000000-0000-4000-8000-000000136802'::uuid), ('50000000-0000-4000-8000-000000136803'::uuid), ('50000000-0000-4000-8000-000000136804'::uuid), ('50000000-0000-4000-8000-000000136806'::uuid) $$,
	'account deletion cascades only its feedback and preserves other accounts'
);

DELETE FROM public.organizations WHERE id = '20000000-0000-4000-8000-000000136802';
SELECT results_eq(
	$$ SELECT organization_id, organization_name, message FROM public.beta_feedback WHERE id = '50000000-0000-4000-8000-000000136804' $$,
	$$ VALUES (NULL::uuid, 'Communications Bravo'::text, 'Raw own feedback with foreign context'::text) $$,
	'Organization deletion detaches feedback while preserving its saved context and message'
);

SELECT * FROM finish();
ROLLBACK;
