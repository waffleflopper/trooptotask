-- Leader notes, counseling records, documents and follow-ups write their own audit entries. The server writes them
-- through service-role commands for the member it authorized, so each entry names that member. A signed-in client
-- cannot run those commands or write an entry, and the text of a record is never saved.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

CREATE FUNCTION pg_temp.id(p_suffix text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT ('a1996000-0000-4000-8000-' || lpad(p_suffix, 12, '0'))::uuid;
$$;
CREATE FUNCTION pg_temp.act_as(p_user text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', pg_temp.id(p_user)::text, true),
    set_config('request.jwt.claims', json_build_object('sub', pg_temp.id(p_user), 'role', 'authenticated')::text, true);
$$;
CREATE FUNCTION pg_temp.as_server() RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '{"role": "service_role"}', true);
$$;
CREATE FUNCTION pg_temp.doc(p_name text) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.id('101') || '/personnel/' || pg_temp.id('301') || '/documents/' || p_name;
$$;

INSERT INTO auth.users (id, aud, role, email, email_confirmed_at)
SELECT pg_temp.id(n::text), 'authenticated', 'authenticated', 'person-records-' || n || '@example.test', now()
FROM generate_series(1, 2) AS n;
INSERT INTO public.user_profiles (user_id, rank, first_name, last_name) VALUES (pg_temp.id('1'), 'SSG', 'Sam', 'Rivera');
INSERT INTO public.organizations (id, name, created_by) VALUES (pg_temp.id('101'), 'Person Records Alpha', pg_temp.id('1'));
INSERT INTO public.organization_memberships (
  organization_id, user_id, role, member_preset, capability_overrides, access_scope_kind, access_scope_group_ids, email
) VALUES
  (pg_temp.id('101'), pg_temp.id('1'), 'owner', 'editor', '{}', 'organization', ARRAY[]::uuid[], NULL),
  (pg_temp.id('101'), pg_temp.id('2'), 'member', 'operator', '{"personnel": "operate"}', 'organization', ARRAY[]::uuid[],
    'operator@example.test');
INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, slug) VALUES
  (pg_temp.id('301'), pg_temp.id('101'), 'SPC', 'Jane', 'Doe', 'person-records-doe'),
  (pg_temp.id('302'), pg_temp.id('101'), 'PFC', 'Rich', 'Roe', 'person-records-roe');

SELECT ok(NOT has_function_privilege('authenticated', 'public.insert_personnel_artifacts(uuid,uuid,text,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.update_personnel_artifact(uuid,uuid,uuid,text,uuid,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.delete_personnel_artifact(uuid,uuid,uuid,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.insert_personnel_artifacts(uuid,uuid,text,jsonb)', 'EXECUTE'),
  'only the server runs the record commands');

SELECT pg_temp.as_server();
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT count(*)::integer FROM public.insert_personnel_artifacts(pg_temp.id('2'), pg_temp.id('101'), 'leader_notes',
    jsonb_build_array(
      jsonb_build_object('personnel_id', pg_temp.id('301'), 'author', pg_temp.id('2'), 'text', 'Private note text'),
      jsonb_build_object('personnel_id', pg_temp.id('302'), 'author', pg_temp.id('2'), 'text', 'Private note text')))),
  2, 'a bulk leader note writes one row per person');
SELECT is(coalesce(current_setting('request.jwt.claim.sub', true), ''), '',
  'the member is the signed-in member only while the command writes');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'leader_notes', note.id,
  '{"text": "Private revised text"}')
FROM public.leader_notes note WHERE note.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'leader_notes', note.id,
  jsonb_build_object('archived_at', now(), 'archived_by', pg_temp.id('2')))
FROM public.leader_notes note WHERE note.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'leader_notes', note.id,
  '{"archived_at": null, "archived_by": null}')
FROM public.leader_notes note WHERE note.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'leader_notes', note.id,
  jsonb_build_object('archived_at', now(), 'archived_by', pg_temp.id('2')))
FROM public.leader_notes note WHERE note.personnel_id = pg_temp.id('301');
SELECT public.delete_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'leader_notes', note.id)
FROM public.leader_notes note WHERE note.personnel_id = pg_temp.id('301');
SELECT throws_ok(
  format($$ SELECT public.update_personnel_artifact(%L, %L, %L, 'leader_notes', note.id, %L)
    FROM public.leader_notes note WHERE note.personnel_id = %L $$,
    pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('302'), json_build_object('personnel_id', pg_temp.id('301')), pg_temp.id('302')),
  '22023', NULL, 'a command cannot move a record to another person');
SELECT throws_ok(
  format($$ SELECT public.delete_personnel_artifact(%L, %L, %L, 'counseling_records', %L) $$,
    pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('1')),
  '22023', NULL, 'a record that holds a file is deleted only by its file command');

SELECT public.insert_personnel_artifacts(pg_temp.id('2'), pg_temp.id('101'), 'counseling_records', jsonb_build_array(
  jsonb_build_object('personnel_id', pg_temp.id('301'), 'date_conducted', '2030-01-10', 'title', 'Private title',
    'subject', 'Private title', 'summary', 'Private summary', 'uploaded_by', pg_temp.id('2'), 'status', 'completed')));
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'counseling_records', record.id,
  jsonb_build_object('archived_at', now(), 'archived_by', pg_temp.id('2')))
FROM public.counseling_records record WHERE record.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'counseling_records', record.id,
  '{"archived_at": null, "archived_by": null}')
FROM public.counseling_records record WHERE record.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'counseling_records', record.id,
  jsonb_build_object('archived_at', '2030-02-01T00:00:00Z', 'archived_by', pg_temp.id('2')))
FROM public.counseling_records record WHERE record.personnel_id = pg_temp.id('301');
SELECT deletion.deleted FROM public.counseling_records record,
  public.delete_archived_personnel_artifact(pg_temp.id('101'), pg_temp.id('301'), 'counseling', record.id,
    '2030-02-01T00:00:00Z', pg_temp.id('2')) AS deletion
WHERE record.personnel_id = pg_temp.id('301');

SELECT public.insert_personnel_artifacts(pg_temp.id('2'), pg_temp.id('101'), 'personnel_documents', jsonb_build_array(
  jsonb_build_object('personnel_id', pg_temp.id('301'), 'title', 'Private document', 'file_path', pg_temp.doc('a.pdf'),
    'file_size_bytes', 10, 'content_type', 'application/pdf', 'uploaded_by', pg_temp.id('2'))));
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_documents', doc.id,
  jsonb_build_object('archived_at', '2030-02-01T00:00:00Z', 'archived_by', pg_temp.id('2')))
FROM public.personnel_documents doc WHERE doc.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_documents', doc.id,
  '{"archived_at": null, "archived_by": null}')
FROM public.personnel_documents doc WHERE doc.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_documents', doc.id,
  jsonb_build_object('archived_at', '2030-02-01T00:00:00Z', 'archived_by', pg_temp.id('2')))
FROM public.personnel_documents doc WHERE doc.personnel_id = pg_temp.id('301');
SELECT deletion.deleted FROM public.personnel_documents doc,
  public.delete_archived_personnel_artifact(pg_temp.id('101'), pg_temp.id('301'), 'document', doc.id,
    '2030-02-01T00:00:00Z', pg_temp.id('2')) AS deletion
WHERE doc.personnel_id = pg_temp.id('301');

SELECT public.insert_personnel_artifacts(pg_temp.id('2'), pg_temp.id('101'), 'personnel_follow_ups', jsonb_build_array(
  jsonb_build_object('personnel_id', pg_temp.id('301'), 'title', 'Private task', 'notes', 'Private notes',
    'due_date', '2030-03-01', 'status', 'open', 'created_by', pg_temp.id('2'))));
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_follow_ups', task.id,
  '{"title": "Private retitled", "due_date": "2030-03-05"}')
FROM public.personnel_follow_ups task WHERE task.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_follow_ups', task.id,
  jsonb_build_object('status', 'completed', 'completed_at', now(), 'completed_by', pg_temp.id('2')))
FROM public.personnel_follow_ups task WHERE task.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_follow_ups', task.id,
  '{"status": "open", "completed_at": null, "completed_by": null}')
FROM public.personnel_follow_ups task WHERE task.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_follow_ups', task.id,
  jsonb_build_object('status', 'archived', 'archived_at', now(), 'archived_by', pg_temp.id('2')))
FROM public.personnel_follow_ups task WHERE task.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_follow_ups', task.id,
  '{"status": "open", "archived_at": null, "archived_by": null}')
FROM public.personnel_follow_ups task WHERE task.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_follow_ups', task.id,
  '{"updated_at": "2030-03-02T00:00:00Z"}')
FROM public.personnel_follow_ups task WHERE task.personnel_id = pg_temp.id('301');
SELECT public.update_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_follow_ups', task.id,
  jsonb_build_object('status', 'archived', 'archived_at', now(), 'archived_by', pg_temp.id('2')))
FROM public.personnel_follow_ups task WHERE task.personnel_id = pg_temp.id('301');
SELECT public.delete_personnel_artifact(pg_temp.id('2'), pg_temp.id('101'), pg_temp.id('301'), 'personnel_follow_ups', task.id)
FROM public.personnel_follow_ups task WHERE task.personnel_id = pg_temp.id('301');
SELECT is(coalesce(current_setting('request.jwt.claim.sub', true), ''), '', 'every command restores the caller''s claim');
RESET ROLE;

SELECT bag_eq(
  $$ SELECT action, resource_type, user_id, actor_label, record_label, subject_personnel_id, subject_label, details
     FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND subject_personnel_id = pg_temp.id('301')
       AND resource_type IN ('leader_note', 'counseling_record', 'personnel_document', 'follow_up') $$,
  $$ SELECT kind, record_type, pg_temp.id('2') AS actor, 'operator@example.test' AS actor_label, NULL::text AS record_label,
       pg_temp.id('301') AS person, 'SPC Doe, Jane' AS subject_label, '{}'::jsonb AS details
     FROM (VALUES
       ('personnel.leader_note.created', 'leader_note'), ('personnel.leader_note.updated', 'leader_note'),
       ('personnel.leader_note.archived', 'leader_note'), ('personnel.leader_note.restored', 'leader_note'),
       ('personnel.leader_note.archived', 'leader_note'), ('personnel.leader_note.deleted', 'leader_note'),
       ('personnel.counseling_record.created', 'counseling_record'), ('personnel.counseling_record.archived', 'counseling_record'),
       ('personnel.counseling_record.restored', 'counseling_record'), ('personnel.counseling_record.archived', 'counseling_record'),
       ('personnel.counseling_record.deleted', 'counseling_record'),
       ('personnel.document.created', 'personnel_document'), ('personnel.document.archived', 'personnel_document'),
       ('personnel.document.restored', 'personnel_document'), ('personnel.document.archived', 'personnel_document'),
       ('personnel.document.deleted', 'personnel_document'),
       ('personnel.follow_up.created', 'follow_up'), ('personnel.follow_up.updated', 'follow_up'),
       ('personnel.follow_up.completed', 'follow_up'), ('personnel.follow_up.reopened', 'follow_up'),
       ('personnel.follow_up.archived', 'follow_up'), ('personnel.follow_up.restored', 'follow_up'),
       ('personnel.follow_up.archived', 'follow_up'), ('personnel.follow_up.deleted', 'follow_up')
     ) AS expected(kind, record_type) $$,
  'every change names the member the server wrote for and the person whose record it is, and a bookkeeping-only update writes nothing');
SELECT is(
  (SELECT count(DISTINCT batch_id)::integer FROM public.audit_logs
    WHERE org_id = pg_temp.id('101') AND action = 'personnel.leader_note.created'),
  1, 'the leader notes of one bulk action share a batch');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND details::text ~ 'Private'),
  0, 'no note, title, summary or file name is saved in any entry');
SELECT is(
  (SELECT author FROM public.leader_notes WHERE personnel_id = pg_temp.id('302')),
  pg_temp.id('2')::text, 'the record names the same member as its entry');

SELECT pg_temp.act_as('2');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$ SELECT public.insert_personnel_artifacts(%L, %L, 'leader_notes', %L) $$,
    pg_temp.id('1'), pg_temp.id('101'), json_build_array(json_build_object('personnel_id', pg_temp.id('302'), 'author', pg_temp.id('1'), 'text', 'x'))),
  '42501', NULL, 'a signed-in member cannot run the command, so cannot write a note in another member''s name');
SELECT throws_ok(
  format($$ SELECT public.delete_archived_personnel_artifact(%L, %L, 'document', %L, now(), %L) $$,
    pg_temp.id('101'), pg_temp.id('301'), pg_temp.id('1'), pg_temp.id('1')),
  '42501', NULL, 'nor delete a file record in another member''s name');
SELECT throws_ok(
  $$ INSERT INTO public.audit_logs (user_id, actor_label, org_id, action, resource_type, subject_label)
     VALUES (pg_temp.id('1'), 'GEN Forged, Actor', pg_temp.id('101'), 'personnel.leader_note.created', 'leader_note', 'SPC Doe, Jane') $$,
  '42501', NULL, 'a member cannot write a record entry directly');
RESET ROLE;
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
INSERT INTO public.leader_notes (organization_id, personnel_id, author, text)
VALUES (pg_temp.id('101'), pg_temp.id('302'), pg_temp.id('2'), 'Private client note');
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND action = 'personnel.leader_note.created'
    AND subject_personnel_id = pg_temp.id('302') AND user_id = pg_temp.id('1')),
  1, 'a member''s own write names that member, whatever author it claims');

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_test_rejects_note CHECK (action <> 'personnel.follow_up.created') NOT VALID;
SELECT pg_temp.as_server();
SET LOCAL ROLE service_role;
SELECT throws_ok(
  format($$ SELECT public.insert_personnel_artifacts(%L, %L, 'personnel_follow_ups', %L) $$,
    pg_temp.id('2'), pg_temp.id('101'),
    json_build_array(json_build_object('personnel_id', pg_temp.id('302'), 'title', 'Rolled back', 'created_by', pg_temp.id('2')))),
  '23514', NULL, 'a record change whose audit write fails raises the failure');
RESET ROLE;
ALTER TABLE public.audit_logs DROP CONSTRAINT audit_test_rejects_note;
SELECT is((SELECT count(*)::integer FROM public.personnel_follow_ups WHERE title = 'Rolled back'), 0, 'and the change is rolled back');

INSERT INTO public.personnel_follow_ups (organization_id, personnel_id, title, created_by)
VALUES (pg_temp.id('101'), pg_temp.id('302'), 'Open task', pg_temp.id('1'));
DELETE FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND subject_personnel_id = pg_temp.id('302');
SELECT pg_temp.act_as('1');
SET LOCAL ROLE authenticated;
SELECT public.archive_personnel(pg_temp.id('101'), ARRAY[pg_temp.id('302')], now());
SELECT public.restore_personnel(pg_temp.id('101'), pg_temp.id('302'));
RESET ROLE;
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND subject_personnel_id = pg_temp.id('302')
    AND resource_type IN ('leader_note', 'follow_up')),
  0, 'records archived and restored with their person leave the person''s own entry as the audited event');
SELECT is(
  (SELECT count(*)::integer FROM public.leader_notes WHERE personnel_id = pg_temp.id('302') AND archived_at IS NULL),
  2, 'and the records are restored');

SELECT lives_ok($$ DELETE FROM public.personnel WHERE id = pg_temp.id('302') $$, 'a person with records can still be removed');
SELECT is(
  (SELECT count(*)::integer FROM public.audit_logs WHERE org_id = pg_temp.id('101') AND subject_personnel_id = pg_temp.id('302')
    AND resource_type IN ('leader_note', 'follow_up')),
  0, 'records removed with their person leave the person deletion as the audited event');

SELECT * FROM finish();
ROLLBACK;
