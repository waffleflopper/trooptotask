BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT is((SELECT count(*)::integer FROM public.whats_new_entries WHERE published_on IS NOT NULL), 28,
 'every changelog entry was imported as published');
SELECT results_eq($$SELECT id, title, published_on, paragraphs FROM public.whats_new_entries WHERE id = '2026-10-23-critical-tasks-defaults'$$,
 $$VALUES ('2026-10-23-critical-tasks-defaults'::text, 'Critical Tasks Defaults Moved to the Toolbar'::text, '2026-10-23'::date,
  ARRAY['The default expiration and expiring-soon window for Critical Tasks no longer sit below the Task Library. Choose Defaults on the Task Library toolbar to change them. On a narrow screen, Defaults is under More.',
        'Who can change them has not changed: anyone who can manage the Critical Tasks library.']::text[])$$,
 'an imported entry keeps its id, title, date and ordered paragraphs');
SELECT results_eq($$SELECT id FROM public.whats_new_entries WHERE published_seq IS NOT NULL ORDER BY published_seq DESC LIMIT 3$$,
 $$VALUES ('2026-10-24-faster-pages'::text), ('2026-10-24-personnel-roster'::text), ('2026-10-23-critical-tasks-defaults'::text)$$,
 'the newest imported entry is still the first changelog entry, so nobody sees an old entry as new');

INSERT INTO auth.users(id,email) VALUES
 ('e8690000-0000-4000-8000-000000000701','whatsnew-operator@example.test'),
 ('e8690000-0000-4000-8000-000000000702','whatsnew-ordinary@example.test');
INSERT INTO public.platform_operators(user_id) VALUES ('e8690000-0000-4000-8000-000000000701');

INSERT INTO public.whats_new_entries(id,title,paragraphs) VALUES ('draft-entry','Draft title',ARRAY['Draft paragraph']);
SELECT is((SELECT published_seq FROM public.whats_new_entries WHERE id='draft-entry'),NULL::bigint,'a draft has no publication order');
UPDATE public.whats_new_entries SET published_on='2026-10-25' WHERE id='draft-entry';
SELECT ok((SELECT published_seq > (SELECT max(published_seq) FROM public.whats_new_entries WHERE id <> 'draft-entry') FROM public.whats_new_entries WHERE id='draft-entry'),
 'publishing makes the entry the newest');
CREATE TEMP TABLE seq_before AS SELECT published_seq FROM public.whats_new_entries WHERE id='draft-entry';
UPDATE public.whats_new_entries SET title='Draft title edited', published_on='2026-10-26' WHERE id='draft-entry';
SELECT is((SELECT published_seq FROM public.whats_new_entries WHERE id='draft-entry'),(SELECT published_seq FROM seq_before),'editing a published entry keeps its place');
UPDATE public.whats_new_entries SET published_on=NULL WHERE id='draft-entry';
SELECT is((SELECT published_seq FROM public.whats_new_entries WHERE id='draft-entry'),NULL::bigint,'an unpublished entry loses its place');
SELECT throws_ok($$INSERT INTO public.whats_new_entries(id,title,paragraphs) VALUES ('blank-paragraph','Title',ARRAY[''])$$,'23514',NULL,'a blank paragraph is rejected');
SELECT throws_ok($$INSERT INTO public.whats_new_entries(id,title,paragraphs,published_on) VALUES ('empty-published','Title',ARRAY[]::text[],'2026-10-25')$$,'23514',NULL,'a published entry needs a paragraph');

INSERT INTO public.platform_announcements(id,title,message,type,created_by) VALUES
 ('e8690000-0000-4000-8000-000000000801','Banner one','Message','info','e8690000-0000-4000-8000-000000000701'),
 ('e8690000-0000-4000-8000-000000000802','Banner two','Message','warning','e8690000-0000-4000-8000-000000000701');
INSERT INTO public.announcement_dismissals(announcement_id,user_id) VALUES
 ('e8690000-0000-4000-8000-000000000801','e8690000-0000-4000-8000-000000000701'),
 ('e8690000-0000-4000-8000-000000000801','e8690000-0000-4000-8000-000000000702');

SET LOCAL ROLE service_role;
SELECT results_eq($$SELECT announcement_id, dismissal_count FROM public.platform_announcement_dismissal_counts() WHERE announcement_id IN ('e8690000-0000-4000-8000-000000000801','e8690000-0000-4000-8000-000000000802') ORDER BY announcement_id$$,
 $$VALUES ('e8690000-0000-4000-8000-000000000801'::uuid, 2::bigint)$$,'the server counts dismissals per banner in one read');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','e8690000-0000-4000-8000-000000000702',true);
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
SELECT is((SELECT count(*)::integer FROM public.whats_new_entries WHERE id='draft-entry'),0,'a signed-in account cannot see a draft');
SELECT is((SELECT count(*)::integer FROM public.whats_new_entries),28,'a signed-in account reads only the published entries');
SELECT throws_ok($$INSERT INTO public.whats_new_entries(id,title,paragraphs,published_on,updated_by) VALUES ('forged','Forged',ARRAY['x'],'2026-10-25','e8690000-0000-4000-8000-000000000701')$$,'42501',NULL,'a signed-in account cannot write an entry or set updated_by');
SELECT throws_ok($$UPDATE public.whats_new_entries SET updated_by='e8690000-0000-4000-8000-000000000702' WHERE id='2026-10-24-personnel-roster'$$,'42501',NULL,'a signed-in account cannot update an entry');
SELECT throws_ok($$DELETE FROM public.whats_new_entries WHERE id='2026-10-24-personnel-roster'$$,'42501',NULL,'a signed-in account cannot delete an entry');
SELECT throws_ok($$INSERT INTO public.platform_announcements(title,message,created_by) VALUES ('Forged','Forged','e8690000-0000-4000-8000-000000000702')$$,'42501',NULL,'a signed-in account cannot write a banner');
SELECT throws_ok($$SELECT * FROM public.platform_announcement_dismissal_counts()$$,'42501',NULL,'a signed-in account cannot read dismissal counts');
SELECT is((SELECT count(*)::integer FROM public.platform_announcements WHERE id IN ('e8690000-0000-4000-8000-000000000801','e8690000-0000-4000-8000-000000000802')),2,'a signed-in account still reads banners');

SELECT set_config('request.jwt.claim.sub','e8690000-0000-4000-8000-000000000701',true);
SELECT is(public.is_platform_operator(),true,'the operator session is at aal2');
SELECT is((SELECT count(*)::integer FROM public.whats_new_entries WHERE id='draft-entry'),0,'the operator sees drafts only through the server');
SELECT throws_ok($$INSERT INTO public.whats_new_entries(id,title,paragraphs,updated_by) VALUES ('operator-direct','Direct',ARRAY['x'],'e8690000-0000-4000-8000-000000000701')$$,'42501',NULL,'the operator cannot write an entry directly');
SELECT throws_ok($$UPDATE public.whats_new_entries SET title='Direct' WHERE id='draft-entry'$$,'42501',NULL,'the operator cannot update an entry directly');
SELECT throws_ok($$DELETE FROM public.whats_new_entries WHERE id='draft-entry'$$,'42501',NULL,'the operator cannot delete an entry directly');
SELECT throws_ok($$INSERT INTO public.platform_announcements(title,message,created_by) VALUES ('Direct','Direct','e8690000-0000-4000-8000-000000000701')$$,'42501',NULL,'the operator cannot insert a banner directly');
SELECT throws_ok($$UPDATE public.platform_announcements SET is_active=false$$,'42501',NULL,'the operator cannot update a banner directly');
SELECT throws_ok($$DELETE FROM public.platform_announcements$$,'42501',NULL,'the operator cannot delete a banner directly');
SELECT throws_ok($$SELECT * FROM public.platform_announcement_dismissal_counts()$$,'42501',NULL,'the operator reads dismissal counts only through the server');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok($$SELECT count(*) FROM public.whats_new_entries$$,'42501',NULL,'anonymous requests cannot read entries');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
