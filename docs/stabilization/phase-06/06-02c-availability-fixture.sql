-- Extend the D01 before-state with ordinary Calendar availability before
-- applying the D02 status migration. Disposable populated upgrade only.
BEGIN;
INSERT INTO public.status_types
  (id, organization_id, name, color, text_color, sort_order)
VALUES
  ('a6010000-0000-4000-8000-000000000702', 'a6010000-0000-4000-8000-000000000102', 'Foreign Leave', '#445566', '#ffffff', 7);

INSERT INTO public.availability_entries
  (id, organization_id, personnel_id, status_type_id, start_date, end_date, note)
VALUES
  ('a6010000-0000-4000-8000-000000000711', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000301', 'a6010000-0000-4000-8000-000000000701', '2030-03-10', '2030-03-12', 'Alpha availability'),
  ('a6010000-0000-4000-8000-000000000712', 'a6010000-0000-4000-8000-000000000101', 'a6010000-0000-4000-8000-000000000303', 'a6010000-0000-4000-8000-000000000701', '2030-03-10', '2030-03-12', 'Charlie availability'),
  ('a6010000-0000-4000-8000-000000000713', 'a6010000-0000-4000-8000-000000000102', 'a6010000-0000-4000-8000-000000000304', 'a6010000-0000-4000-8000-000000000702', '2030-03-10', '2030-03-12', 'Foreign availability');
COMMIT;
