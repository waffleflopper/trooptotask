CREATE OR REPLACE FUNCTION "public"."mark_organization_invitation_email_outbox_delivery"(
	"p_outbox_id" uuid,
	"p_status" text,
	"p_marked_at" timestamp with time zone DEFAULT "now"(),
	"p_last_error" text DEFAULT NULL
)
RETURNS SETOF "public"."organization_invitation_email_outbox"
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
	UPDATE public.organization_invitation_email_outbox
	SET
		status = p_status,
		attempt_count = attempt_count + 1,
		last_error = CASE WHEN p_status = 'sent' THEN NULL ELSE p_last_error END,
		updated_at = p_marked_at,
		sent_at = CASE WHEN p_status = 'sent' THEN p_marked_at ELSE NULL END
	WHERE id = p_outbox_id
		AND p_status = ANY (ARRAY['sent'::text, 'failed'::text])
	RETURNING *;
$$;

REVOKE ALL ON FUNCTION "public"."mark_organization_invitation_email_outbox_delivery"(uuid, text, timestamp with time zone, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."mark_organization_invitation_email_outbox_delivery"(uuid, text, timestamp with time zone, text) FROM "anon";
REVOKE ALL ON FUNCTION "public"."mark_organization_invitation_email_outbox_delivery"(uuid, text, timestamp with time zone, text) FROM "authenticated";
GRANT EXECUTE ON FUNCTION "public"."mark_organization_invitation_email_outbox_delivery"(uuid, text, timestamp with time zone, text) TO "service_role";
