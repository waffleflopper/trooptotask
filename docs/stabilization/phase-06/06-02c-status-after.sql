-- Status and availability assertions after the populated D01 -> D02 upgrade.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT no_plan();

SELECT results_eq(
  $$SELECT id, organization_id, name, color, text_color, sort_order
    FROM public.status_types
    WHERE id IN ('a6010000-0000-4000-8000-000000000701','a6010000-0000-4000-8000-000000000702')
    ORDER BY id$$,
  $$VALUES
    ('a6010000-0000-4000-8000-000000000701'::uuid,'a6010000-0000-4000-8000-000000000101'::uuid,'Clinic Available'::text,'#112233'::text,'#ffffff'::text,0::integer),
    ('a6010000-0000-4000-8000-000000000702','a6010000-0000-4000-8000-000000000102','Foreign Leave','#445566','#ffffff',7)$$,
  'both Organizations retain exact status identities, labels, colors and ordering'
);
SELECT results_eq(
  $$SELECT id, organization_id, personnel_id, status_type_id, start_date, end_date, note
    FROM public.availability_entries
    WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000711' AND 'a6010000-0000-4000-8000-000000000713'
    ORDER BY id$$,
  $$VALUES
    ('a6010000-0000-4000-8000-000000000711'::uuid,'a6010000-0000-4000-8000-000000000101'::uuid,'a6010000-0000-4000-8000-000000000301'::uuid,'a6010000-0000-4000-8000-000000000701'::uuid,'2030-03-10'::date,'2030-03-12'::date,'Alpha availability'::text),
    ('a6010000-0000-4000-8000-000000000712','a6010000-0000-4000-8000-000000000101','a6010000-0000-4000-8000-000000000303','a6010000-0000-4000-8000-000000000701','2030-03-10','2030-03-12','Charlie availability'),
    ('a6010000-0000-4000-8000-000000000713','a6010000-0000-4000-8000-000000000102','a6010000-0000-4000-8000-000000000304','a6010000-0000-4000-8000-000000000702','2030-03-10','2030-03-12','Foreign availability')$$,
  'all saved availability entries keep tenant, person, type, dates and note'
);
SELECT is((SELECT count(*)::integer FROM information_schema.columns
  WHERE table_schema='public' AND table_name='status_types'
    AND column_name IN ('da6_availability_treatment','da6_treatment_reviewed')),
  0, 'retired DA6 columns are absent');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_constraint
  WHERE conrelid='public.status_types'::regclass
    AND conname='status_types_da6_availability_treatment_check'),
  'retired DA6 check is absent');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a6010000-0000-4000-8000-000000000002',true);
SELECT results_eq($$SELECT id FROM public.status_types WHERE id IN ('a6010000-0000-4000-8000-000000000701','a6010000-0000-4000-8000-000000000702')$$,
  $$VALUES ('a6010000-0000-4000-8000-000000000701'::uuid)$$,
  'scoped member can read its Organization status but not a foreign status');
SELECT results_eq($$SELECT id FROM public.availability_entries WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000711' AND 'a6010000-0000-4000-8000-000000000713'$$,
  $$VALUES ('a6010000-0000-4000-8000-000000000711'::uuid)$$,
  'scoped member reads only in-scope availability');
WITH changed AS (UPDATE public.availability_entries SET note='Denied' WHERE id='a6010000-0000-4000-8000-000000000712' RETURNING id)
SELECT is(count(*)::integer,0,'scoped member cannot edit Charlie availability') FROM changed;
WITH changed AS (UPDATE public.availability_entries SET note='Allowed' WHERE id='a6010000-0000-4000-8000-000000000711' RETURNING note)
SELECT is((SELECT note FROM changed),'Allowed','scoped member can edit Alpha availability');
WITH changed AS (UPDATE public.status_types SET name='Denied' WHERE id='a6010000-0000-4000-8000-000000000701' RETURNING id)
SELECT is(count(*)::integer,0,'Calendar operator cannot configure status types') FROM changed;
SELECT set_config('request.jwt.claim.sub','a6010000-0000-4000-8000-000000000003',true);
SELECT results_eq($$SELECT id FROM public.availability_entries WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000711' AND 'a6010000-0000-4000-8000-000000000713'$$,
  $$VALUES ('a6010000-0000-4000-8000-000000000713'::uuid)$$,
  'foreign owner reads only foreign availability');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT is((SELECT count(*)::integer FROM public.status_types WHERE id IN ('a6010000-0000-4000-8000-000000000701','a6010000-0000-4000-8000-000000000702')),0,
  'anonymous caller cannot read saved statuses');
SELECT is((SELECT count(*)::integer FROM public.availability_entries WHERE id BETWEEN 'a6010000-0000-4000-8000-000000000711' AND 'a6010000-0000-4000-8000-000000000713'),0,
  'anonymous caller cannot read availability');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
