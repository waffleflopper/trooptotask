BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT results_eq(
 $$SELECT id,to_jsonb(f)-'updated_by' FROM public.beta_feedback f WHERE user_id='10000000-0000-4000-8000-000000186901' ORDER BY id$$,
 $$SELECT id,saved-'admin_notes' FROM upgrade_fixture.feedback_before ORDER BY id$$,
 'upgrade preserves feedback identities, content, status, issue links and original timestamps');
SELECT results_eq(
 $$SELECT feedback_id,body,updated_by,updated_at FROM public.feedback_staff_notes WHERE feedback_id IN (SELECT id FROM upgrade_fixture.feedback_before) ORDER BY feedback_id$$,
 $$VALUES ('50000000-0000-4000-8000-000000186901'::uuid,'Private historical note'::text,NULL::uuid,'2026-02-02T00:00:00Z'::timestamptz),
 ('50000000-0000-4000-8000-000000186902'::uuid,''::text,NULL::uuid,'2026-04-04T00:00:00Z'::timestamptz)$$,
 'every non-NULL historical note moves once without inventing an author');
SELECT is((SELECT count(*) FROM public.feedback_replies),0::bigint,'upgrade does not invent replies');
SELECT is((SELECT count(*) FROM public.notifications),(SELECT total FROM upgrade_fixture.feedback_notifications_before),'upgrade sends no notifications');
SELECT hasnt_column('public','beta_feedback','admin_notes','private legacy column is removed');
SELECT * FROM finish();
ROLLBACK;
