DROP POLICY IF EXISTS "Owners can create organization checkout attempts"
	ON "public"."organization_checkout_attempts";

CREATE POLICY "Owners can create organization checkout attempts"
	ON "public"."organization_checkout_attempts"
	FOR INSERT
	WITH CHECK ("public"."is_org_owner"("organization_id"));

DROP POLICY IF EXISTS "Owners can update organization checkout attempts"
	ON "public"."organization_checkout_attempts";

CREATE POLICY "Owners can update organization checkout attempts"
	ON "public"."organization_checkout_attempts"
	FOR UPDATE
	USING ("public"."is_org_owner"("organization_id"))
	WITH CHECK ("public"."is_org_owner"("organization_id"));

GRANT INSERT, UPDATE ON TABLE "public"."organization_checkout_attempts" TO "authenticated";
