REVOKE ALL ON FUNCTION public.reject_access_request_and_block_linked_invitations(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_access_request_and_block_linked_invitations(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reject_access_request_and_block_linked_invitations(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reject_access_request_and_block_linked_invitations(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) TO service_role;
