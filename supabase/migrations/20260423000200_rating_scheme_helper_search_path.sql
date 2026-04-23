ALTER FUNCTION "public"."can_view_rating_scheme"("p_organization_id" "uuid")
  SET "search_path" TO '';

ALTER FUNCTION "public"."can_edit_rating_scheme"("p_organization_id" "uuid")
  SET "search_path" TO '';

ALTER FUNCTION "public"."can_view_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) SET "search_path" TO '';

ALTER FUNCTION "public"."can_edit_rating_scheme_record"(
  "p_organization_id" "uuid",
  "p_rated_person_id" "uuid"
) SET "search_path" TO '';
