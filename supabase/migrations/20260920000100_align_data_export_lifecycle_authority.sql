-- Export authority follows the current owner/admin membership rather than the
-- Organization's immutable creator identity, matching lifecycle updates.
DROP POLICY IF EXISTS "Org owner can create exports" ON "public"."data_exports";

CREATE POLICY "Authorized members can create exports"
ON "public"."data_exports"
FOR INSERT TO authenticated
WITH CHECK (
    "public"."can_manage_org_members"("org_id")
    AND "requested_by" = (SELECT "auth"."uid"())
);
