-- Work entered after the split, through the functions the app calls. Able's Evaluation completes and his chain then
-- changes; Baker's scheme is restored; Cole's Evaluation completes and reopens, his older one is deleted by an approved
-- request and his scheme is archived; Dana gets a new Evaluation, which moves, and a new senior rater and eval type;
-- retention deletes Dana's rater and Eve.
BEGIN;
CREATE FUNCTION pg_temp.scheme_of(p_person text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.rating_schemes WHERE rated_person_id = ('e7c50000-0000-4000-8000-' || p_person)::uuid;
$$;
CREATE TABLE upgrade_fixture.rating_scheme_split_rollback_ids (name text PRIMARY KEY, id uuid, at timestamptz,
  n bigint);
INSERT INTO upgrade_fixture.rating_scheme_split_rollback_ids (name, id)
SELECT 'able scheme', pg_temp.scheme_of('000000000301');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'e7c50000-0000-4000-8000-000000000001', true),
  set_config('request.jwt.claims', '{"sub":"e7c50000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT public.transition_evaluation('e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000501',
  'drafting', 'completed');
UPDATE public.rating_schemes SET intermediate_rater_name = 'Ivy Next', notes = 'Able scheme notes'
WHERE id = pg_temp.scheme_of('000000000301');
SELECT public.set_rating_scheme_archived('e7c50000-0000-4000-8000-000000000101', pg_temp.scheme_of('000000000302'), false);
SELECT public.transition_evaluation('e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000505',
  'drafting', 'completed');
SELECT public.transition_evaluation('e7c50000-0000-4000-8000-000000000101', 'e7c50000-0000-4000-8000-000000000505',
  'completed', 'with-rater');
CREATE TEMPORARY TABLE started ON COMMIT DROP AS
SELECT public.start_evaluation('e7c50000-0000-4000-8000-000000000101', pg_temp.scheme_of('000000000304'), 'AN',
  '2027-01-01', '2027-12-31', false, 'Dana started') -> 'evaluation' AS evaluation;
SELECT public.transition_evaluation('e7c50000-0000-4000-8000-000000000101', (SELECT (evaluation ->> 'id')::uuid FROM started),
  'drafting', 'with-rater');
UPDATE public.rating_schemes SET senior_rater_name = 'Dana New Senior', eval_type = 'OER'
WHERE id = pg_temp.scheme_of('000000000304');

SET LOCAL ROLE service_role;
SELECT public.approve_record_deletion_request('e7c50000-0000-4000-8000-000000000101',
  'e7c50000-0000-4000-8000-000000000701', 'evaluation', 'e7c50000-0000-4000-8000-000000000504',
  'e7c50000-0000-4000-8000-000000000001', '2026-11-14T00:00:00Z');

SET LOCAL ROLE authenticated;
SELECT public.set_rating_scheme_archived('e7c50000-0000-4000-8000-000000000101', pg_temp.scheme_of('000000000303'), true);

SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF public.delete_expired_personnel('e7c50000-0000-4000-8000-000000000101', ARRAY[
    'e7c50000-0000-4000-8000-000000000305', 'e7c50000-0000-4000-8000-000000000311']::uuid[], '2025-05-30Z') <> 2 THEN
    RAISE EXCEPTION 'Retention kept a Person with rating scheme rows';
  END IF;
END;
$$;
RESET ROLE;

INSERT INTO upgrade_fixture.rating_scheme_split_rollback_ids (name, id, at)
SELECT 'dana started', (evaluation ->> 'id')::uuid, (evaluation ->> 'created_at')::timestamptz FROM started
UNION ALL
SELECT 'cole archived', id, archived_at FROM public.rating_schemes WHERE id = pg_temp.scheme_of('000000000303');
INSERT INTO upgrade_fixture.rating_scheme_split_rollback_ids (name, n)
SELECT 'audit rows', count(*) FROM public.audit_logs WHERE org_id = 'e7c50000-0000-4000-8000-000000000101';

DO $$
BEGIN
  IF ARRAY(SELECT id FROM public.rating_scheme_entries WHERE organization_id = 'e7c50000-0000-4000-8000-000000000101'
    ORDER BY id) <> ARRAY['e7c50000-0000-4000-8000-000000000501', 'e7c50000-0000-4000-8000-000000000502',
      'e7c50000-0000-4000-8000-000000000503', 'e7c50000-0000-4000-8000-000000000505',
      'e7c50000-0000-4000-8000-000000000506']::uuid[] THEN
    RAISE EXCEPTION 'The frozen entries outlived a deleted Evaluation or Person, or lost a kept one';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rating_scheme_entries e JOIN upgrade_fixture.rating_scheme_split_rollback_before b
    ON b.id = e.id WHERE e.id <> 'e7c50000-0000-4000-8000-000000000506' AND to_jsonb(e) <> b.saved) THEN
    RAISE EXCEPTION 'Work after the split changed a frozen entry';
  END IF;
  IF (SELECT rater_person_id FROM public.rating_scheme_entries WHERE id = 'e7c50000-0000-4000-8000-000000000506')
    IS NOT NULL THEN
    RAISE EXCEPTION 'Deleting a rater left its link in the frozen entries';
  END IF;
END;
$$;
COMMIT;
