ALTER TABLE "public"."organization_memberships"
  ADD COLUMN IF NOT EXISTS "can_view_rating_scheme" boolean,
  ADD COLUMN IF NOT EXISTS "can_edit_rating_scheme" boolean;

ALTER TABLE "public"."organization_invitations"
  ADD COLUMN IF NOT EXISTS "can_view_rating_scheme" boolean,
  ADD COLUMN IF NOT EXISTS "can_edit_rating_scheme" boolean;

UPDATE "public"."organization_memberships"
SET
  "can_view_rating_scheme" = COALESCE("can_view_rating_scheme", "can_view_personnel", false),
  "can_edit_rating_scheme" = COALESCE("can_edit_rating_scheme", ("can_edit_personnel" AND "can_edit_leaders_book"), false)
WHERE "can_view_rating_scheme" IS NULL
   OR "can_edit_rating_scheme" IS NULL;

UPDATE "public"."organization_invitations"
SET
  "can_view_rating_scheme" = COALESCE("can_view_rating_scheme", "can_view_personnel", false),
  "can_edit_rating_scheme" = COALESCE("can_edit_rating_scheme", ("can_edit_personnel" AND "can_edit_leaders_book"), false)
WHERE "can_view_rating_scheme" IS NULL
   OR "can_edit_rating_scheme" IS NULL;

ALTER TABLE "public"."organization_memberships"
  ALTER COLUMN "can_view_rating_scheme" SET DEFAULT false,
  ALTER COLUMN "can_view_rating_scheme" SET NOT NULL,
  ALTER COLUMN "can_edit_rating_scheme" SET DEFAULT false,
  ALTER COLUMN "can_edit_rating_scheme" SET NOT NULL;

ALTER TABLE "public"."organization_invitations"
  ALTER COLUMN "can_view_rating_scheme" SET DEFAULT false,
  ALTER COLUMN "can_view_rating_scheme" SET NOT NULL,
  ALTER COLUMN "can_edit_rating_scheme" SET DEFAULT false,
  ALTER COLUMN "can_edit_rating_scheme" SET NOT NULL;

CREATE OR REPLACE FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid")
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_view_rating_scheme" = true
      )
  );
$$;

ALTER FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid")
RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_edit_rating_scheme" = true
      )
  );
$$;

ALTER FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid")
RETURNS TABLE("id" "uuid", "rank" "text", "last_name" "text", "first_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT
    "personnel"."id",
    "personnel"."rank",
    "personnel"."last_name",
    "personnel"."first_name"
  FROM "public"."personnel"
  JOIN "public"."organization_memberships"
    ON "organization_memberships"."organization_id" = "personnel"."organization_id"
   AND "organization_memberships"."user_id" = "auth"."uid"()
  WHERE "personnel"."organization_id" = "p_organization_id"
    AND "personnel"."archived_at" IS NULL
    AND (
      "organization_memberships"."role" IN ('owner', 'admin')
      OR "organization_memberships"."can_view_rating_scheme" = true
    )
    AND (
      "organization_memberships"."scoped_group_id" IS NULL
      OR "personnel"."group_id" IS NULL
      OR "organization_memberships"."scoped_group_id" = "personnel"."group_id"
    )
  ORDER BY "personnel"."last_name" ASC, "personnel"."first_name" ASC;
$$;

ALTER FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_view_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."personnel"
      ON "personnel"."id" = "p_rated_person_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_view_rating_scheme" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;

ALTER FUNCTION "public"."can_view_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."can_edit_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "public"."organization_memberships"
    JOIN "public"."personnel"
      ON "personnel"."id" = "p_rated_person_id"
     AND "personnel"."organization_id" = "p_organization_id"
    WHERE "organization_memberships"."organization_id" = "p_organization_id"
      AND "organization_memberships"."user_id" = "auth"."uid"()
      AND (
        "organization_memberships"."role" IN ('owner', 'admin')
        OR "organization_memberships"."can_edit_rating_scheme" = true
      )
      AND (
        ("organization_memberships"."scoped_group_id" IS NULL)
        OR ("personnel"."group_id" IS NULL)
        OR ("organization_memberships"."scoped_group_id" = "personnel"."group_id")
      )
  );
$$;

ALTER FUNCTION "public"."can_edit_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) OWNER TO "postgres";

DROP POLICY IF EXISTS "Org editors can manage rating scheme" ON "public"."rating_scheme_entries";
DROP POLICY IF EXISTS "Org members can view rating scheme" ON "public"."rating_scheme_entries";
DROP POLICY IF EXISTS "Users can view rating scheme entries if allowed by scoped rating scheme access" ON "public"."rating_scheme_entries";
DROP POLICY IF EXISTS "Users can insert rating scheme entries if allowed by scoped rating scheme access" ON "public"."rating_scheme_entries";
DROP POLICY IF EXISTS "Users can update rating scheme entries if allowed by scoped rating scheme access" ON "public"."rating_scheme_entries";
DROP POLICY IF EXISTS "Users can delete rating scheme entries if allowed by scoped rating scheme access" ON "public"."rating_scheme_entries";
DROP POLICY IF EXISTS "Users can view personnel if allowed by scoped rating scheme reference access" ON "public"."personnel";
DROP FUNCTION IF EXISTS "public"."can_view_rating_scheme_personnel_record"("p_organization_id" "uuid", "p_group_id" "uuid");

CREATE POLICY "Users can view rating scheme entries if allowed by scoped rating scheme access" ON "public"."rating_scheme_entries"
  FOR SELECT
  USING ("public"."can_view_rating_scheme_record"("organization_id", "rated_person_id"));

CREATE POLICY "Users can insert rating scheme entries if allowed by scoped rating scheme access" ON "public"."rating_scheme_entries"
  FOR INSERT
  WITH CHECK ("public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id"));

CREATE POLICY "Users can update rating scheme entries if allowed by scoped rating scheme access" ON "public"."rating_scheme_entries"
  FOR UPDATE
  USING ("public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id"))
  WITH CHECK ("public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id"));

CREATE POLICY "Users can delete rating scheme entries if allowed by scoped rating scheme access" ON "public"."rating_scheme_entries"
  FOR DELETE
  USING ("public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id"));

GRANT ALL ON FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid") TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") TO "service_role";

GRANT ALL ON FUNCTION "public"."can_view_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) TO "service_role";

GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) TO "anon";
GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_edit_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) TO "service_role";
