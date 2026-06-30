DELETE FROM "public"."organization_rank_catalog"
WHERE "organization_rank_catalog"."source" = 'discovered'
  AND btrim(regexp_replace("organization_rank_catalog"."code", '[[:space:]]+', ' ', 'g')) = '';
