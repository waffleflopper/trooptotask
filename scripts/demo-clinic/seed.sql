-- Fictional troop-clinic demonstration data. Run the entire file as one transaction.
-- Additive only: existing people, Groups, memberships and settings are preserved.
-- Run locally first; see README.md for the owner-operated live import.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TEMP TABLE clinic_demo_config (organization_id uuid NOT NULL, as_of date NOT NULL) ON COMMIT DROP;
INSERT INTO clinic_demo_config VALUES ('3d4fe26d-6bf1-4165-af93-2907373bbfd4', CURRENT_DATE);

-- Deterministic IDs are scoped to this Organization and this fixture version.
CREATE OR REPLACE FUNCTION pg_temp.clinic_demo_id(label text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT md5(organization_id::text || ':clinic-demo-v1:' || label)::uuid FROM pg_temp.clinic_demo_config;
$$;

CREATE TEMP TABLE clinic_demo_people (
  n integer PRIMARY KEY, rank text, first_name text, last_name text, mos text, duty_role text, group_name text
) ON COMMIT DROP;
INSERT INTO clinic_demo_people VALUES
  (1, 'MAJ', 'Elena', 'Mercer', '65D', 'Clinic OIC', 'Leadership'),
  (2, 'SFC', 'Marcus', 'Hale', '68W', 'Clinic NCOIC', 'Leadership'),
  (3, 'CPT', 'Priya', 'Bennett', '70B', 'Operations Officer', 'Leadership'),
  (4, 'SSG', 'Owen', 'Brooks', '68W', 'Training NCO', 'Leadership'),
  (5, 'SGT', 'Tessa', 'Grant', '68G', 'Readiness NCO', 'Leadership'),
  (6, 'SGT', 'Elias', 'Carter', '92Y', 'Supply NCO', 'Leadership'),
  (7, 'SPC', 'Nadia', 'Reed', '68G', 'Patient Administration', 'Leadership'),
  (8, 'SPC', 'Caleb', 'Foster', '42A', 'Human Resources Specialist', 'Leadership'),
  (9, 'PFC', 'Maya', 'Ellis', '92Y', 'Supply Specialist', 'Leadership'),
  (10, 'SPC', 'Jonah', 'Price', '68G', 'Medical Readiness Clerk', 'Leadership'),
  (11, 'CPT', 'Amara', 'Sutton', '65D', 'Physician Assistant', 'Alpha'),
  (12, '1LT', 'Lucas', 'Vaughn', '66H', 'Clinical Nurse', 'Alpha'),
  (13, 'SSG', 'Sofia', 'Navarro', '68W', 'Patient Care NCOIC', 'Alpha'),
  (14, 'SGT', 'Isaac', 'Morgan', '68W', 'Team Leader', 'Alpha'),
  (15, 'SGT', 'Leah', 'Bishop', '68W', 'Team Leader', 'Alpha'),
  (16, 'SGT', 'Adrian', 'Hayes', '68C', 'Practical Nursing NCO', 'Alpha'),
  (17, 'SPC', 'Chloe', 'Ramirez', '68W', 'Combat Medic', 'Alpha'),
  (18, 'SPC', 'Ethan', 'Park', '68W', 'Combat Medic', 'Alpha'),
  (19, 'SPC', 'Naomi', 'Turner', '68C', 'Practical Nursing Specialist', 'Alpha'),
  (20, 'SPC', 'Miles', 'Sullivan', '68W', 'Combat Medic', 'Alpha'),
  (21, 'SPC', 'Zoe', 'Patel', '68W', 'Combat Medic', 'Alpha'),
  (22, 'SPC', 'Aaron', 'Cole', '68C', 'Practical Nursing Specialist', 'Alpha'),
  (23, 'PFC', 'Lena', 'Wallace', '68W', 'Combat Medic', 'Alpha'),
  (24, 'PFC', 'Noah', 'Kim', '68W', 'Combat Medic', 'Alpha'),
  (25, 'SPC', 'Avery', 'Dawson', '68W', 'Combat Medic', 'Alpha'),
  (26, 'PFC', 'Jules', 'Warren', '68W', 'Combat Medic', 'Alpha'),
  (27, 'SPC', 'Cora', 'Mitchell', '68C', 'Practical Nursing Specialist', 'Alpha'),
  (28, 'PFC', 'Theo', 'Reyes', '68W', 'Combat Medic', 'Alpha'),
  (29, 'PV2', 'Nora', 'Hughes', '68W', 'Combat Medic', 'Alpha'),
  (30, 'PFC', 'Leo', 'Santos', '68W', 'Combat Medic', 'Alpha'),
  (31, 'CPT', 'Imani', 'Fletcher', '67E', 'Clinical Pharmacist', 'Bravo'),
  (32, 'SSG', 'Daniel', 'West', '68V', 'Clinical Support NCOIC', 'Bravo'),
  (33, 'SGT', 'Freya', 'Collins', '68K', 'Laboratory NCO', 'Bravo'),
  (34, 'SGT', 'Malik', 'Stone', '68P', 'Radiology NCO', 'Bravo'),
  (35, 'SGT', 'Eva', 'Lawson', '68Q', 'Pharmacy NCO', 'Bravo'),
  (36, 'SPC', 'Finn', 'Marshall', '68V', 'Respiratory Specialist', 'Bravo'),
  (37, 'SPC', 'Isabel', 'Chen', '68K', 'Laboratory Specialist', 'Bravo'),
  (38, 'SPC', 'Roman', 'Diaz', '68P', 'Radiology Specialist', 'Bravo'),
  (39, 'SPC', 'Sage', 'Anderson', '68Q', 'Pharmacy Specialist', 'Bravo'),
  (40, 'SPC', 'Henry', 'Walsh', '68J', 'Medical Logistics Specialist', 'Bravo'),
  (41, 'SPC', 'Aria', 'Powell', '68V', 'Respiratory Specialist', 'Bravo'),
  (42, 'PFC', 'Felix', 'Bailey', '68K', 'Laboratory Specialist', 'Bravo'),
  (43, 'SPC', 'Mila', 'Henderson', '68P', 'Radiology Specialist', 'Bravo'),
  (44, 'PFC', 'Silas', 'Rivera', '68Q', 'Pharmacy Specialist', 'Bravo'),
  (45, 'SPC', 'Esme', 'Porter', '68J', 'Medical Logistics Specialist', 'Bravo'),
  (46, 'PFC', 'Oscar', 'Gray', '68V', 'Respiratory Specialist', 'Bravo'),
  (47, 'SPC', 'Iris', 'Hamilton', '68K', 'Laboratory Specialist', 'Bravo'),
  (48, 'PFC', 'Hugo', 'Bryant', '68P', 'Radiology Specialist', 'Bravo'),
  (49, 'PV2', 'Ada', 'Stevens', '68Q', 'Pharmacy Specialist', 'Bravo'),
  (50, 'PFC', 'Ronan', 'Wells', '68J', 'Medical Logistics Specialist', 'Bravo');

DO $$
DECLARE
  target uuid := (SELECT organization_id FROM pg_temp.clinic_demo_config);
  org_name text;
BEGIN
  -- Lock the parent to serialize this import and protect referenced Organization state.
  SELECT name INTO org_name FROM public.organizations WHERE id = target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target Organization % does not exist; no data imported', target; END IF;
  IF EXISTS (SELECT 1 FROM public.personnel WHERE organization_id = target AND slug LIKE 'clinic-demo-%')
    OR EXISTS (SELECT 1 FROM public.onboarding_templates WHERE id = pg_temp.clinic_demo_id('onboarding-template')) THEN
    RAISE EXCEPTION 'Clinic demo already present or conflicting demo records exist; no data imported';
  END IF;
  IF EXISTS (
    SELECT lower(btrim(name)) FROM public.groups WHERE organization_id = target
      AND lower(btrim(name)) IN ('leadership', 'alpha', 'bravo') GROUP BY lower(btrim(name)) HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Ambiguous standard Group names; no data imported'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.clinic_demo_people p WHERE NOT EXISTS (
      SELECT 1 FROM public.organization_rank_catalog r
      WHERE r.organization_id = target AND r.code = p.rank AND r.state = 'active'
    )
  ) THEN RAISE EXCEPTION 'Target needs the standard Army rank catalog before importing'; END IF;
  RAISE NOTICE 'Adding 50 fictional clinic personnel to % (%); existing personnel and Groups are preserved', org_name, target;
END;
$$;

INSERT INTO public.groups (id, organization_id, name, sort_order)
SELECT pg_temp.clinic_demo_id('group-' || name), c.organization_id, g.name, g.sort_order
FROM clinic_demo_config c CROSS JOIN (VALUES ('Leadership', 0), ('Alpha', 1), ('Bravo', 2)) g(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.groups existing WHERE existing.organization_id = c.organization_id
  AND lower(btrim(existing.name)) = lower(g.name));

INSERT INTO public.personnel (id, organization_id, rank, first_name, last_name, mos, clinic_role, group_id, slug)
SELECT pg_temp.clinic_demo_id('person-' || p.n), c.organization_id, p.rank, p.first_name, p.last_name, p.mos, p.duty_role,
  g.id, 'clinic-demo-' || lower(p.first_name || '-' || p.last_name)
FROM clinic_demo_people p CROSS JOIN clinic_demo_config c
JOIN public.groups g ON g.organization_id = c.organization_id
WHERE lower(btrim(g.name)) = lower(p.group_name);

-- Display names carry a demo marker so existing configuration is never silently reused or overwritten.
CREATE TEMP TABLE clinic_demo_training (n integer, name text, months integer, mos text[], optional boolean) ON COMMIT DROP;
INSERT INTO clinic_demo_training VALUES
  (1, 'Cyber Awareness (Demo)', 12, '{}', false),
  (2, 'HIPAA and Privacy (Demo)', 12, '{}', false),
  (3, 'Basic Life Support (Demo)', 24, '{65D,66H,68W,68C,68V}', false),
  (4, 'Infection Prevention (Demo)', 12, '{}', false),
  (5, 'Emergency Response Drill (Demo)', 12, '{}', false),
  (6, 'Equipment Safety (Demo)', 12, '{}', false),
  (7, 'Clinic Orientation (Demo)', NULL, '{}', false),
  (8, 'Medication Safety (Demo)', 12, '{67E,68Q,66H,68C}', false),
  (9, 'Specimen Handling (Demo)', 12, '{68K,68W,68C}', false),
  (10, 'Leadership Development (Demo)', 12, '{}', true);

INSERT INTO public.training_types (id, organization_id, name, description, expiration_months, applies_to_mos,
  is_optional, color, sort_order)
SELECT pg_temp.clinic_demo_id('training-' || t.n), c.organization_id, t.name,
  'Fictional demonstration requirement; not an official Army or clinical training policy.', t.months, t.mos,
  t.optional, (ARRAY['#2563eb','#0891b2','#059669','#7c3aed'])[1 + t.n % 4], 100 + t.n
FROM clinic_demo_training t CROSS JOIN clinic_demo_config c;

-- Keep onboarding-linked training consistent: people 43-48 are arrivals, 49-50 completed orientation.
-- Other missing rows deliberately represent training that has not been completed.
INSERT INTO public.personnel_trainings (id, organization_id, personnel_id, training_type_id,
  completion_date, expiration_date, notes)
SELECT pg_temp.clinic_demo_id('training-record-' || p.n || '-' || t.n), c.organization_id,
  pg_temp.clinic_demo_id('person-' || p.n), pg_temp.clinic_demo_id('training-' || t.n),
  CASE WHEN p.n >= 43 AND t.n IN (1,2,7) THEN c.as_of - ((p.n - 42) * 3) + 2
    WHEN t.months IS NULL THEN c.as_of - 20
    ELSE (c.as_of + d.days_remaining - make_interval(months => t.months))::date END,
  CASE WHEN t.months IS NULL THEN NULL
    WHEN p.n >= 43 AND t.n IN (1,2) THEN (c.as_of - ((p.n - 42) * 3) + 2 + make_interval(months => t.months))::date
    ELSE c.as_of + d.days_remaining END,
  'Synthetic training completion for demonstration only.'
FROM clinic_demo_people p CROSS JOIN clinic_demo_training t CROSS JOIN clinic_demo_config c
CROSS JOIN LATERAL (SELECT CASE (p.n + t.n) % 5 WHEN 0 THEN -14 WHEN 1 THEN 15 WHEN 2 THEN 45 ELSE 180 END days_remaining) d
WHERE (cardinality(t.mos) = 0 OR p.mos = ANY(t.mos))
  AND CASE
    WHEN p.n BETWEEN 43 AND 48 AND t.n IN (1,2,7) THEN
      (t.n = 1 AND p.n >= 44) OR (t.n = 2 AND p.n >= 46) OR (t.n = 7 AND p.n >= 48)
    WHEN p.n IN (49,50) AND t.n IN (1,2,7) THEN true
    ELSE (p.n + t.n) % 7 <> 0
  END;

-- Fictional task codes are intentionally not official task numbers or procedural instructions.
CREATE TEMP TABLE clinic_demo_tasks (n integer, title text, category text, mos text[]) ON COMMIT DROP;
INSERT INTO clinic_demo_tasks VALUES
  (1, 'Prepare a patient-care area', 'Clinic fundamentals', '{}'),
  (2, 'Demonstrate patient handoff communication', 'Clinic fundamentals', '{}'),
  (3, 'Participate in an emergency response simulation', 'Clinic fundamentals', '{}'),
  (4, 'Document a simulated patient encounter', 'Patient care', '{68W,68C,65D,66H}'),
  (5, 'Complete a simulated casualty assessment', 'Patient care', '{68W,68C}'),
  (6, 'Demonstrate equipment readiness checks', 'Respiratory support', '{68V}'),
  (7, 'Complete a simulated specimen workflow', 'Laboratory', '{68K}'),
  (8, 'Prepare a simulated imaging workflow', 'Radiology', '{68P}'),
  (9, 'Demonstrate a simulated medication inventory', 'Pharmacy', '{68Q,67E}'),
  (10, 'Reconcile a simulated medical supply request', 'Medical logistics', '{68J,92Y}');
INSERT INTO public.ict_tasks (id, organization_id, task_code, title, description, category, mos, expiration_months, sort_order)
SELECT pg_temp.clinic_demo_id('ict-' || t.n), c.organization_id, 'DEMO-CLINIC-' || lpad(t.n::text, 2, '0'),
  t.title, 'Fictional ICTL demonstration item; not an official task or clinical instruction.', t.category, t.mos, 12, t.n
FROM clinic_demo_tasks t CROSS JOIN clinic_demo_config c;
INSERT INTO public.personnel_ict_completions (id, organization_id, personnel_id, ict_task_id,
  completed_at, validation_method, validated_by, notes)
SELECT pg_temp.clinic_demo_id('ict-record-' || p.n || '-' || t.n), c.organization_id,
  pg_temp.clinic_demo_id('person-' || p.n), pg_temp.clinic_demo_id('ict-' || t.n),
  (c.as_of + CASE (p.n + t.n) % 4 WHEN 0 THEN -10 WHEN 1 THEN 20 ELSE 200 END - interval '12 months')::date,
  (ARRAY['Practical Exercise','Demonstration','Simulation']::public.ict_validation_method[])[1 + (p.n + t.n) % 3],
  'SSG Owen Brooks (fictional evaluator)', 'Synthetic validation; missing tasks remain in progress.'
FROM clinic_demo_people p CROSS JOIN clinic_demo_tasks t CROSS JOIN clinic_demo_config c
WHERE (cardinality(t.mos) = 0 OR p.mos = ANY(t.mos)) AND (p.n + t.n) % 3 <> 0;

INSERT INTO public.onboarding_templates (id, organization_id, name, description)
SELECT pg_temp.clinic_demo_id('onboarding-template'), organization_id, 'Clinic Arrival (Demo)',
  'Fictional arrival process: reception, paperwork, training and section integration.' FROM clinic_demo_config;
CREATE TEMP TABLE clinic_demo_steps (n integer, name text, kind text, training_n integer, stages jsonb) ON COMMIT DROP;
INSERT INTO clinic_demo_steps VALUES
  (1, 'Meet sponsor and report to clinic', 'checkbox', NULL, NULL),
  (2, 'In-processing packet', 'paperwork', NULL, '["Not started","Documents received","Under review","Verified"]'),
  (3, 'Cyber awareness', 'training', 1, NULL),
  (4, 'Clinic access request', 'paperwork', NULL, '["Not started","Submitted","Approved","Access confirmed"]'),
  (5, 'Privacy orientation', 'training', 2, NULL),
  (6, 'Equipment issue and section tour', 'checkbox', NULL, NULL),
  (7, 'Clinic orientation', 'training', 7, NULL),
  (8, 'Initial counseling with supervisor', 'checkbox', NULL, NULL);
INSERT INTO public.onboarding_template_steps (id, organization_id, template_id, name, description,
  step_type, training_type_id, stages, sort_order)
SELECT pg_temp.clinic_demo_id('step-' || s.n), c.organization_id, pg_temp.clinic_demo_id('onboarding-template'),
  s.name, 'Demo arrival checklist item.', s.kind,
  CASE WHEN s.training_n IS NULL THEN NULL ELSE pg_temp.clinic_demo_id('training-' || s.training_n) END, s.stages, s.n
FROM clinic_demo_steps s CROSS JOIN clinic_demo_config c;
INSERT INTO public.personnel_onboardings (id, organization_id, personnel_id, template_id, started_at, completed_at, status)
SELECT pg_temp.clinic_demo_id('onboarding-' || p.n), c.organization_id, pg_temp.clinic_demo_id('person-' || p.n),
  pg_temp.clinic_demo_id('onboarding-template'), c.as_of - ((p.n - 42) * 3),
  CASE WHEN p.n >= 49 THEN c.as_of - 2 ELSE NULL END,
  CASE WHEN p.n >= 49 THEN 'completed' ELSE 'in_progress' END
FROM clinic_demo_people p CROSS JOIN clinic_demo_config c WHERE p.n >= 43;
INSERT INTO public.onboarding_step_progress (id, organization_id, onboarding_id, template_step_id,
  step_name, step_type, training_type_id, stages, sort_order, completed, current_stage)
SELECT pg_temp.clinic_demo_id('progress-' || p.n || '-' || s.n), c.organization_id,
  pg_temp.clinic_demo_id('onboarding-' || p.n), pg_temp.clinic_demo_id('step-' || s.n), s.name, s.kind,
  CASE WHEN s.training_n IS NULL THEN NULL ELSE pg_temp.clinic_demo_id('training-' || s.training_n) END,
  s.stages, s.n, done.completed,
  CASE WHEN s.kind <> 'paperwork' THEN NULL WHEN done.completed THEN s.stages ->> 3
    ELSE s.stages ->> ((p.n - 43) % 3) END
FROM clinic_demo_people p CROSS JOIN clinic_demo_steps s CROSS JOIN clinic_demo_config c
CROSS JOIN LATERAL (SELECT CASE WHEN s.kind = 'training' THEN EXISTS (
  SELECT 1 FROM public.personnel_trainings pt WHERE pt.personnel_id = pg_temp.clinic_demo_id('person-' || p.n)
    AND pt.training_type_id = pg_temp.clinic_demo_id('training-' || s.training_n) AND pt.organization_id = c.organization_id
) ELSE p.n >= 49 OR s.n <= p.n - 42 END completed) done
WHERE p.n >= 43;

-- 12 evaluation packets: officer/NCO chains, current/due/overdue, and completed examples.
CREATE TEMP TABLE clinic_demo_evals (n integer, rater integer, senior integer, days_remaining integer, workflow text) ON COMMIT DROP;
INSERT INTO clinic_demo_evals VALUES
  (2,1,NULL,120,'drafting'), (3,1,NULL,45,'with-rater'), (4,2,1,15,'with-senior-rater'),
  (5,2,1,-10,'submitted-to-s1'), (6,2,1,-60,'completed'), (11,1,NULL,160,'drafting'),
  (12,11,1,25,'with-rater'), (13,2,1,55,'drafting'), (14,13,11,-5,'with-rated-soldier'),
  (15,13,11,-30,'completed'), (16,13,11,20,'with-senior-rater'), (32,2,1,90,'drafting');
INSERT INTO public.rating_scheme_entries (id, organization_id, rated_person_id, eval_type, rater_person_id,
  senior_rater_person_id, senior_rater_name, rating_period_start, rating_period_end, status, report_type, workflow_status, notes)
SELECT pg_temp.clinic_demo_id('eval-' || e.n), c.organization_id, pg_temp.clinic_demo_id('person-' || e.n),
  CASE WHEN p.rank IN ('CPT','1LT') THEN 'OER' ELSE 'NCOER' END, pg_temp.clinic_demo_id('person-' || e.rater),
  CASE WHEN e.senior IS NULL THEN NULL ELSE pg_temp.clinic_demo_id('person-' || e.senior) END,
  CASE WHEN e.senior IS NULL THEN 'LTC Jordan Ashford (fictional battalion commander)' ELSE NULL END,
  (c.as_of + e.days_remaining + 1 - interval '12 months')::date, c.as_of + e.days_remaining,
  CASE WHEN e.workflow = 'completed' THEN 'completed' ELSE 'active' END, 'AN', e.workflow,
  'Fictional evaluation tracking example; no actual performance assessment.'
FROM clinic_demo_evals e JOIN clinic_demo_people p USING(n) CROSS JOIN clinic_demo_config c;

-- Demo-only Calendar configuration avoids altering the standard pack or its existing assignments.
INSERT INTO public.status_types (id, organization_id, name, color, text_color, sort_order)
SELECT pg_temp.clinic_demo_id('status-' || name), c.organization_id, name || ' (Demo)', color, '#ffffff', 100 + n
FROM clinic_demo_config c CROSS JOIN (VALUES
  (1,'Leave','#15803d'), (2,'School','#2563eb'),
  (3,'Appointment','#c2410c'), (4,'Training / TDY','#7c3aed')
) s(n,name,color);
INSERT INTO public.availability_entries (id, organization_id, personnel_id, status_type_id, start_date, end_date, note)
SELECT pg_temp.clinic_demo_id('availability-' || p.n), c.organization_id, pg_temp.clinic_demo_id('person-' || p.n),
  pg_temp.clinic_demo_id('status-' || (ARRAY['Leave','School','Appointment','Training / TDY'])[1 + p.n % 4]),
  c.as_of + (p.n % 15) - 5, c.as_of + (p.n % 15) - 5 + CASE WHEN p.n % 4 = 2 THEN 0 ELSE 2 END,
  'Fictional schedule entry for the clinic demonstration.'
FROM clinic_demo_people p CROSS JOIN clinic_demo_config c WHERE p.n BETWEEN 17 AND 30;
INSERT INTO public.assignment_types (id, organization_id, name, short_name, assign_to, color, sort_order, show_in_date_header)
SELECT pg_temp.clinic_demo_id('assignment-' || name), c.organization_id, name || ' (Demo)', short_name, assign_to, color, 100 + n, assign_to='group'
FROM clinic_demo_config c CROSS JOIN (VALUES
  (1,'Morning Huddle Lead','HUD','personnel','#2563eb'),
  (2,'Clinic Training Team','TRN','group','#059669')
) a(n,name,short_name,assign_to,color);
INSERT INTO public.daily_assignments (id, organization_id, assignment_type_id, date, assignee_id)
SELECT pg_temp.clinic_demo_id('daily-person-' || day), c.organization_id, pg_temp.clinic_demo_id('assignment-Morning Huddle Lead'),
  c.as_of + day, pg_temp.clinic_demo_id('person-' || (4 + ((day + 14) % 3)))::text
FROM clinic_demo_config c CROSS JOIN generate_series(-7,21) day WHERE extract(isodow FROM c.as_of + day) <= 5;
INSERT INTO public.daily_assignments (id, organization_id, assignment_type_id, date, assignee_id)
SELECT pg_temp.clinic_demo_id('daily-group-' || day), c.organization_id, pg_temp.clinic_demo_id('assignment-Clinic Training Team'),
  c.as_of + day, g.id::text
FROM clinic_demo_config c CROSS JOIN generate_series(-7,21) day
JOIN public.groups g ON lower(btrim(g.name)) = CASE WHEN day % 2 = 0 THEN 'alpha' ELSE 'bravo' END
WHERE g.organization_id = c.organization_id AND extract(isodow FROM c.as_of + day) = 4;

INSERT INTO public.leader_notes (id, organization_id, personnel_id, author, text)
SELECT pg_temp.clinic_demo_id('note-' || p.n), c.organization_id, pg_temp.clinic_demo_id('person-' || p.n),
  'SSG Owen Brooks (fictional)', 'Demo: coordinate remaining arrival tasks with the section sponsor; schedule the next supervised skills session.'
FROM clinic_demo_people p CROSS JOIN clinic_demo_config c WHERE p.n BETWEEN 43 AND 48;
INSERT INTO public.personnel_follow_ups (id, organization_id, personnel_id, title, notes, due_date, status, created_by)
SELECT pg_temp.clinic_demo_id('follow-up-' || p.n), c.organization_id, pg_temp.clinic_demo_id('person-' || p.n),
  'Arrival progress review (Demo)', 'Fictional follow-up: confirm remaining paperwork and training appointments.',
  c.as_of + p.n - 45, 'open', 'SSG Owen Brooks (fictional)'
FROM clinic_demo_people p CROSS JOIN clinic_demo_config c WHERE p.n BETWEEN 43 AND 48;

-- Report committed scope without exposing account credentials or touching user access.
SELECT o.id AS organization_id, o.name, c.as_of AS demo_date,
  (SELECT count(*) FROM public.personnel p WHERE p.organization_id = o.id) AS total_personnel,
  (SELECT count(*) FROM public.personnel p WHERE p.organization_id = o.id AND p.slug LIKE 'clinic-demo-%') AS demo_personnel,
  (SELECT count(*) FROM public.groups g WHERE g.organization_id = o.id) AS total_groups
FROM clinic_demo_config c JOIN public.organizations o ON o.id = c.organization_id;
COMMIT;
