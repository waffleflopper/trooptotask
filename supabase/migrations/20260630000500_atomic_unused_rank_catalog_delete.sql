CREATE OR REPLACE FUNCTION "public"."organization_rank_catalog_reference_matches"(
  "p_value" text,
  "p_code" text,
  "p_allow_normalized" boolean
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT "p_value" IS NOT NULL
    AND (
      btrim("p_value") = "p_code"
      OR (
        "p_allow_normalized"
        AND upper(btrim("p_value")) = upper("p_code")
      )
    );
$$;

CREATE OR REPLACE FUNCTION "public"."delete_unused_organization_rank_catalog_entry"(
  "p_organization_id" uuid,
  "p_entry_id" uuid,
  "p_code" text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  "catalog_entry" "public"."organization_rank_catalog"%ROWTYPE;
  "allow_normalized_match" boolean;
  "active_reference_count" integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended("p_organization_id"::text, 1248));

  SELECT *
    INTO "catalog_entry"
    FROM "public"."organization_rank_catalog"
    WHERE "organization_id" = "p_organization_id"
      AND "id" = "p_entry_id"
      AND "code" = "p_code"
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rank catalog entry could not be removed'
      USING ERRCODE = 'P0002';
  END IF;

  IF "catalog_entry"."source" = 'built-in' THEN
    RAISE EXCEPTION 'Built-in ranks cannot be removed. Retire them instead.'
      USING ERRCODE = '23514';
  END IF;

  LOCK TABLE
    "public"."personnel",
    "public"."training_types",
    "public"."duty_roster_templates",
    "public"."duty_template_slots"
    IN SHARE MODE;

  SELECT NOT EXISTS (
    SELECT 1
    FROM "public"."organization_rank_catalog" AS "other_entry"
    WHERE "other_entry"."organization_id" = "p_organization_id"
      AND "other_entry"."id" <> "p_entry_id"
      AND upper("other_entry"."code") = upper("p_code")
  )
  INTO "allow_normalized_match";

  SELECT
    (
      SELECT count(*)::integer
      FROM "public"."personnel"
      WHERE "organization_id" = "p_organization_id"
        AND "public"."organization_rank_catalog_reference_matches"("rank", "p_code", "allow_normalized_match")
    )
    + (
      SELECT count(*)::integer
      FROM "public"."training_types"
      WHERE "organization_id" = "p_organization_id"
        AND (
          EXISTS (
            SELECT 1
            FROM unnest("applies_to_ranks") AS "rank_filter"("rank_code")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "rank_filter"."rank_code",
              "p_code",
              "allow_normalized_match"
            )
          )
          OR EXISTS (
            SELECT 1
            FROM unnest("excluded_ranks") AS "rank_filter"("rank_code")
            WHERE "public"."organization_rank_catalog_reference_matches"(
              "rank_filter"."rank_code",
              "p_code",
              "allow_normalized_match"
            )
          )
        )
    )
    + (
      SELECT count(*)::integer
      FROM "public"."duty_roster_templates"
      WHERE "organization_id" = "p_organization_id"
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements_text(
            CASE
              WHEN jsonb_typeof("pool_criteria" -> 'rankValues') = 'array'
                THEN "pool_criteria" -> 'rankValues'
              ELSE '[]'::jsonb
            END
          ) AS "rank_filter"("rank_code")
          WHERE "public"."organization_rank_catalog_reference_matches"(
            "rank_filter"."rank_code",
            "p_code",
            "allow_normalized_match"
          )
        )
    )
    + (
      SELECT count(*)::integer
      FROM "public"."duty_template_slots"
      WHERE "organization_id" = "p_organization_id"
        AND EXISTS (
          SELECT 1
          FROM unnest("allowed_ranks") AS "rank_filter"("rank_code")
          WHERE "public"."organization_rank_catalog_reference_matches"(
            "rank_filter"."rank_code",
            "p_code",
            "allow_normalized_match"
          )
        )
    )
  INTO "active_reference_count";

  IF "active_reference_count" > 0 THEN
    RAISE EXCEPTION 'Rank is referenced by active Organization data. Retire it instead.'
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM "public"."organization_rank_catalog"
  WHERE "organization_id" = "p_organization_id"
    AND "id" = "p_entry_id";
END;
$$;

REVOKE ALL ON FUNCTION "public"."organization_rank_catalog_reference_matches"(text, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."delete_unused_organization_rank_catalog_entry"(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."delete_unused_organization_rank_catalog_entry"(uuid, uuid, text) TO "service_role";
