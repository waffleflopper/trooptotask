INSERT INTO auth.users (id, email)
VALUES ('56cc736c-ef6d-4676-af51-866edffad951', 'ci-demo-owner@example.test');
INSERT INTO public.organizations (id, name, created_by)
VALUES ('3d4fe26d-6bf1-4165-af93-2907373bbfd4', 'CI fictional clinic', '56cc736c-ef6d-4676-af51-866edffad951');
INSERT INTO public.organization_rank_catalog (organization_id, code, label, service, category, pay_grade)
SELECT '3d4fe26d-6bf1-4165-af93-2907373bbfd4', code, code, 'army', category, grade
FROM (VALUES
  ('PV2', 'enlisted', 'E-2'), ('PFC', 'enlisted', 'E-3'), ('SPC', 'enlisted', 'E-4'),
  ('SGT', 'enlisted', 'E-5'), ('SSG', 'enlisted', 'E-6'), ('SFC', 'enlisted', 'E-7'),
  ('1LT', 'officer', 'O-2'), ('CPT', 'officer', 'O-3'), ('MAJ', 'officer', 'O-4')
) AS ranks(code, category, grade);
