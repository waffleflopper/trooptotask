-- Load only in a disposable project after the passing 06-01c before suite.
-- Each row references a real type by ID but uses another Organization.
INSERT INTO public.daily_assignments(id,organization_id,assignment_type_id,date,assignee_id)
VALUES ('a6010000-0000-4000-8000-000000000611','a6010000-0000-4000-8000-000000000102','a6010000-0000-4000-8000-000000000401','2030-03-22','a6010000-0000-4000-8000-000000000304');
INSERT INTO public.duty_roster_templates(id,organization_id,name,slug,assignment_type_id)
VALUES ('a6010000-0000-4000-8000-000000000521','a6010000-0000-4000-8000-000000000102','Mismatch synthetic','mismatch-synthetic','a6010000-0000-4000-8000-000000000401');
INSERT INTO public.duty_roster_history(id,organization_id,assignment_type_id,name,start_date,end_date,roster)
VALUES ('a6010000-0000-4000-8000-000000000531','a6010000-0000-4000-8000-000000000102','a6010000-0000-4000-8000-000000000401','Mismatch synthetic','2030-03-22','2030-03-22','{}'::jsonb);
