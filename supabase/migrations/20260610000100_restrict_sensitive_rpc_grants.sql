REVOKE EXECUTE ON FUNCTION public.search_users_by_email(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.search_users_by_email(text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_users_by_email(text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_users_by_email(text, integer) TO service_role;
ALTER FUNCTION public.search_users_by_email(text, integer) SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_audit_logs() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs() TO service_role;
ALTER FUNCTION public.cleanup_old_audit_logs() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_webhook_events() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_webhook_events() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_webhook_events() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_webhook_events() TO service_role;
ALTER FUNCTION public.cleanup_old_webhook_events() SET search_path = public, pg_temp;
