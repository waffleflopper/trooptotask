REVOKE EXECUTE ON FUNCTION "public"."sensitive_file_object_is_readable"(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."sensitive_file_object_is_readable"(text, text) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."sensitive_file_object_is_readable"(text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sensitive_file_object_is_readable"(text, text) TO "service_role";

REVOKE EXECUTE ON FUNCTION "public"."sensitive_file_object_is_writable"(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION "public"."sensitive_file_object_is_writable"(text, text) FROM "anon";
GRANT EXECUTE ON FUNCTION "public"."sensitive_file_object_is_writable"(text, text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."sensitive_file_object_is_writable"(text, text) TO "service_role";
