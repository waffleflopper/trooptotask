-- Read-only acceptance checks for the committed demo. Run after seed.sql.
BEGIN READ ONLY;
DO $$
DECLARE
  target uuid := '3d4fe26d-6bf1-4165-af93-2907373bbfd4';
  demo_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO demo_ids FROM public.personnel
  WHERE organization_id = target AND slug LIKE 'clinic-demo-%';
  IF coalesce(cardinality(demo_ids),0) <> 50 THEN RAISE EXCEPTION 'Expected 50 demo Personnel'; END IF;
  IF EXISTS (
    SELECT expected.name FROM (VALUES ('Leadership',10),('Alpha',20),('Bravo',20)) expected(name,n)
    LEFT JOIN public.groups g ON g.organization_id=target AND lower(btrim(g.name))=lower(expected.name)
    LEFT JOIN public.personnel p ON p.group_id=g.id AND p.id=ANY(demo_ids)
    GROUP BY expected.name,expected.n HAVING count(p.id) <> expected.n
  ) THEN RAISE EXCEPTION 'Expected demo Group distribution 10 Leadership / 20 Alpha / 20 Bravo'; END IF;
  IF (SELECT count(*) FROM public.rating_scheme_entries WHERE organization_id=target AND rated_person_id=ANY(demo_ids)) <> 12
    OR (SELECT count(*) FROM public.rating_scheme_entries WHERE organization_id=target AND rated_person_id=ANY(demo_ids) AND status='completed') <> 2 THEN
    RAISE EXCEPTION 'Expected 12 evals including 2 completed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rating_scheme_entries WHERE organization_id=target AND rated_person_id=ANY(demo_ids) AND status='active' AND rating_period_end<CURRENT_DATE)
    OR NOT EXISTS (SELECT 1 FROM public.rating_scheme_entries WHERE organization_id=target AND rated_person_id=ANY(demo_ids) AND rating_period_end BETWEEN CURRENT_DATE AND CURRENT_DATE+30)
    OR NOT EXISTS (SELECT 1 FROM public.rating_scheme_entries WHERE organization_id=target AND rated_person_id=ANY(demo_ids) AND rating_period_end BETWEEN CURRENT_DATE+31 AND CURRENT_DATE+60) THEN
    RAISE EXCEPTION 'Expected overdue, 30-day and 60-day evaluation examples'; END IF;
  IF (SELECT count(*) FROM public.personnel_onboardings WHERE organization_id=target AND personnel_id=ANY(demo_ids) AND status='in_progress') <> 6
    OR (SELECT count(*) FROM public.personnel_onboardings WHERE organization_id=target AND personnel_id=ANY(demo_ids) AND status='completed') <> 2 THEN
    RAISE EXCEPTION 'Expected 6 active and 2 completed onboardings'; END IF;
  IF EXISTS (
    SELECT o.id FROM public.personnel_onboardings o LEFT JOIN public.onboarding_step_progress s ON s.onboarding_id=o.id
    WHERE o.organization_id=target AND o.personnel_id=ANY(demo_ids) GROUP BY o.id HAVING count(s.id)<>8
  ) THEN RAISE EXCEPTION 'Every demo onboarding must contain 8 steps'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.onboarding_step_progress s JOIN public.personnel_onboardings o ON o.id=s.onboarding_id
    WHERE o.personnel_id=ANY(demo_ids) AND (
      s.organization_id<>target OR o.organization_id<>target
      OR (o.status='completed' AND NOT s.completed)
      OR (s.step_type='training' AND s.completed IS DISTINCT FROM EXISTS (
        SELECT 1 FROM public.personnel_trainings t WHERE t.personnel_id=o.personnel_id AND t.training_type_id=s.training_type_id AND t.organization_id=target
      ))
      OR (s.step_type='paperwork' AND NOT s.stages ? s.current_stage)
    )
  ) THEN RAISE EXCEPTION 'Onboarding steps disagree with training, stages or completion'; END IF;
  IF (SELECT count(*) FROM public.training_types WHERE organization_id=target AND id IN (
    SELECT md5(target::text || ':clinic-demo-v1:training-' || n)::uuid FROM generate_series(1,10) n
  )) <> 10 THEN
    RAISE EXCEPTION 'Expected 10 Demo training types'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.personnel_trainings WHERE organization_id=target AND personnel_id=ANY(demo_ids) AND expiration_date<CURRENT_DATE)
    OR NOT EXISTS (SELECT 1 FROM public.personnel_trainings WHERE organization_id=target AND personnel_id=ANY(demo_ids) AND expiration_date BETWEEN CURRENT_DATE AND CURRENT_DATE+30)
    OR NOT EXISTS (SELECT 1 FROM public.personnel_trainings WHERE organization_id=target AND personnel_id=ANY(demo_ids) AND expiration_date BETWEEN CURRENT_DATE+31 AND CURRENT_DATE+60)
    OR NOT EXISTS (SELECT 1 FROM public.personnel_trainings WHERE organization_id=target AND personnel_id=ANY(demo_ids) AND expiration_date>CURRENT_DATE+60) THEN
    RAISE EXCEPTION 'Expected expired, orange, yellow and current training'; END IF;
  IF (SELECT count(*) FROM public.ict_tasks WHERE organization_id=target AND task_code LIKE 'DEMO-CLINIC-%') <> 10 THEN
    RAISE EXCEPTION 'Expected 10 fictional ICTL tasks'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.personnel p CROSS JOIN public.ict_tasks t
    WHERE p.id=ANY(demo_ids) AND t.organization_id=target AND t.task_code LIKE 'DEMO-CLINIC-%'
      AND (cardinality(t.mos)=0 OR p.mos=ANY(t.mos)) AND NOT EXISTS (
        SELECT 1 FROM public.personnel_ict_completions c WHERE c.personnel_id=p.id AND c.ict_task_id=t.id
      )
  ) THEN RAISE EXCEPTION 'Expected incomplete ICTL work'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.personnel_trainings r JOIN public.training_types t ON t.id=r.training_type_id
    WHERE r.personnel_id=ANY(demo_ids) AND (r.organization_id<>target OR t.organization_id<>target
      OR (cardinality(t.applies_to_mos)>0 AND NOT EXISTS (SELECT 1 FROM public.personnel p WHERE p.id=r.personnel_id AND p.mos=ANY(t.applies_to_mos))))
  ) THEN RAISE EXCEPTION 'Training scope or MOS mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.personnel_ict_completions r JOIN public.ict_tasks t ON t.id=r.ict_task_id
    WHERE r.personnel_id=ANY(demo_ids) AND (r.organization_id<>target OR t.organization_id<>target
      OR (cardinality(t.mos)>0 AND NOT EXISTS (SELECT 1 FROM public.personnel p WHERE p.id=r.personnel_id AND p.mos=ANY(t.mos))))
  ) THEN RAISE EXCEPTION 'ICTL scope or MOS mismatch'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.rating_scheme_entries e
    CROSS JOIN LATERAL unnest(ARRAY[e.rated_person_id,e.rater_person_id,e.senior_rater_person_id]) linked(id)
    JOIN public.personnel p ON p.id=linked.id
    WHERE e.rated_person_id=ANY(demo_ids) AND (e.organization_id<>target OR p.organization_id<>target)
  ) THEN RAISE EXCEPTION 'Evaluation chain crosses Organizations'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.availability_entries WHERE organization_id=target AND personnel_id=ANY(demo_ids))
    OR NOT EXISTS (SELECT 1 FROM public.daily_assignments a JOIN public.assignment_types t ON t.id=a.assignment_type_id
      WHERE a.organization_id=target AND t.name LIKE '% (Demo)' AND a.date BETWEEN CURRENT_DATE AND CURRENT_DATE+7) THEN
    RAISE EXCEPTION 'Expected visible Calendar availability and assignments'; END IF;
  RAISE NOTICE 'PASS: clinic roster, evals, onboarding, training, ICTL, Calendar and tenant links';
END;
$$;
ROLLBACK;
