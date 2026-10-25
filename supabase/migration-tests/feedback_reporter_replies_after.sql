BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT results_eq($$SELECT id,to_jsonb(r)-'author' FROM public.feedback_replies r ORDER BY id$$,
 $$SELECT id,saved FROM upgrade_fixture.replies_before ORDER BY id$$,'upgrade preserves every existing reply field and identity');
SELECT results_eq($$SELECT author FROM public.feedback_replies ORDER BY id$$,
 $$VALUES ('operator'::text)$$,'historical reply is backfilled as operator');
SELECT results_eq($$SELECT id,to_jsonb(n)-'link' FROM public.notifications n ORDER BY id$$,
 $$SELECT id,saved-'link' FROM upgrade_fixture.reply_notifications_before ORDER BY id$$,'link migration preserves notification identity, content, read state and timestamps');
SELECT results_eq($$SELECT link FROM public.notifications ORDER BY id$$,
 $$VALUES ('/account/feedback/50000000-0000-4000-8000-000000186931'::text),('/account/feedback/50000000-0000-4000-8000-000000186931'::text)$$,'old link moves to Account and existing Account link stays unchanged');
SELECT * FROM finish();
ROLLBACK;
