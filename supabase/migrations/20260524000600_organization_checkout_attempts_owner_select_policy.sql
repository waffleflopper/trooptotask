DROP POLICY IF EXISTS "Members can view organization checkout attempts"
	ON "public"."organization_checkout_attempts";

DROP POLICY IF EXISTS "Owners can view organization checkout attempts"
	ON "public"."organization_checkout_attempts";

CREATE POLICY "Owners can view organization checkout attempts"
	ON "public"."organization_checkout_attempts"
	FOR SELECT
	USING ("public"."is_org_owner"("organization_id"));
