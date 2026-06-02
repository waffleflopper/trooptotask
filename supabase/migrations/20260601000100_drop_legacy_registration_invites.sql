ALTER TABLE "public"."access_requests"
	DROP CONSTRAINT IF EXISTS "access_requests_invite_id_fkey";

ALTER TABLE "public"."access_requests"
	DROP COLUMN IF EXISTS "invite_id";

DROP TABLE IF EXISTS "public"."registration_invites";
