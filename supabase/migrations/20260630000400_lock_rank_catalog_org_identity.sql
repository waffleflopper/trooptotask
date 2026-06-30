CREATE OR REPLACE FUNCTION "public"."prevent_organization_rank_catalog_org_move"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."organization_id" IS DISTINCT FROM OLD."organization_id" THEN
    RAISE EXCEPTION 'organization_rank_catalog.organization_id cannot be changed'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "prevent_organization_rank_catalog_org_move"
  ON "public"."organization_rank_catalog";

CREATE TRIGGER "prevent_organization_rank_catalog_org_move"
  BEFORE UPDATE OF "organization_id"
  ON "public"."organization_rank_catalog"
  FOR EACH ROW
  EXECUTE FUNCTION "public"."prevent_organization_rank_catalog_org_move"();
