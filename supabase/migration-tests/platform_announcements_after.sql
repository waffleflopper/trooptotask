BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();
SELECT ok((SELECT migration_absent AND entries_absent FROM upgrade_fixture.platform_announcements_baseline),'announcement migrations were absent from the populated predecessor');
SELECT results_eq($$SELECT id,title,message,type,is_active,expires_at,created_by FROM public.platform_announcements WHERE id='e8690000-0000-4000-8000-000000000902'$$,
 $$SELECT id,title,message,type,is_active,expires_at,created_by FROM upgrade_fixture.platform_announcements_before$$,
 'the saved banner keeps every field through the upgrade');
SET LOCAL ROLE service_role;
SELECT results_eq($$SELECT announcement_id,dismissal_count FROM public.platform_announcement_dismissal_counts()$$,
 $$VALUES ('e8690000-0000-4000-8000-000000000902'::uuid,1::bigint)$$,'the saved dismissal is counted after the upgrade');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.whats_new_entries WHERE published_on IS NOT NULL),27,'the upgrade imported every changelog entry');
SELECT * FROM finish();
ROLLBACK;
