-- Owner-run read-only preview of the exact target. No data changes.
BEGIN READ ONLY;
SELECT id, name, suspended_at FROM public.organizations
WHERE id = '3d4fe26d-6bf1-4165-af93-2907373bbfd4';
SELECT g.id, g.name, count(p.id) AS existing_personnel
FROM public.groups g LEFT JOIN public.personnel p ON p.group_id=g.id AND p.organization_id=g.organization_id
WHERE g.organization_id='3d4fe26d-6bf1-4165-af93-2907373bbfd4'
GROUP BY g.id,g.name,g.sort_order ORDER BY g.sort_order,g.name;
SELECT id, rank, first_name, last_name, slug, group_id FROM public.personnel
WHERE organization_id='3d4fe26d-6bf1-4165-af93-2907373bbfd4' ORDER BY last_name,first_name;
SELECT code, state FROM public.organization_rank_catalog
WHERE organization_id='3d4fe26d-6bf1-4165-af93-2907373bbfd4'
  AND code IN ('PV2','PFC','SPC','SGT','SSG','SFC','1LT','CPT','MAJ') ORDER BY sort_order;
SELECT 'Demo personnel already present' AS check_name,count(*) AS count FROM public.personnel
WHERE organization_id='3d4fe26d-6bf1-4165-af93-2907373bbfd4' AND slug LIKE 'clinic-demo-%';
ROLLBACK;
