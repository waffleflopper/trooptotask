-- Legacy Duty event, template and history rows are no longer read by the app.
-- Calendar generation relations are retired separately after this dependent group.
-- Drop children first so retained Calendar and Personnel relations need no CASCADE.
DROP TABLE public.duty_event_slots;
DROP TABLE public.duty_events;
DROP TABLE public.duty_event_runs;
DROP TABLE public.duty_template_rotation_baselines;
DROP TABLE public.duty_template_slots;
DROP TABLE public.duty_templates;
DROP TABLE public.duty_roster_history;
