import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260522001100_reject_access_request_blocks_linked_invitations.sql'),
	'utf8'
).toLowerCase();

const privilegeMigration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260613000100_restrict_service_role_mutation_rpc_grants.sql'),
	'utf8'
).toLowerCase();

describe('reject access request blocks linked invitations migration', () => {
	it('rejects the access request and blocks linked pending invitations in one database transition', () => {
		expect(migration).toContain(
			'create or replace function "public"."reject_access_request_and_block_linked_invitations"'
		);
		expect(migration).toContain('update "public"."access_requests"');
		expect(migration).toContain('"access_requests"."status" = \'pending\'');
		expect(migration).toContain('"status" = \'blocked\'::"public"."invitation_status"');
		expect(migration).toContain('"blocked_at" = now()');
		expect(migration).toContain('"blocked_by" = "p_reviewer_id"');
		expect(migration).toContain('for update of "organization_invitations"');
	});

	it('records organization-scoped audit context without deleting invitation history', () => {
		expect(migration).toContain('insert into "public"."audit_logs"');
		expect(migration).toContain('organization_invitation.blocked_by_access_request_rejection');
		expect(migration).toContain('linked_platform_access_rejected');
		expect(migration).not.toMatch(/delete\s+from\s+"public"\."organization_invitations"/i);
		expect(migration).toContain(
			'grant execute on function "public"."reject_access_request_and_block_linked_invitations"("uuid", "uuid") to "service_role"'
		);
		expect(migration).not.toContain(
			'grant execute on function "public"."reject_access_request_and_block_linked_invitations"("uuid", "uuid") to "authenticated"'
		);
	});

	it('revokes direct client execution in the follow-up privilege migration', () => {
		expect(privilegeMigration).toContain(
			'revoke all on function public.reject_access_request_and_block_linked_invitations(uuid, uuid) from public'
		);
		expect(privilegeMigration).toContain(
			'revoke all on function public.reject_access_request_and_block_linked_invitations(uuid, uuid) from anon'
		);
		expect(privilegeMigration).toContain(
			'revoke all on function public.reject_access_request_and_block_linked_invitations(uuid, uuid) from authenticated'
		);
		expect(privilegeMigration).toContain(
			'grant execute on function public.reject_access_request_and_block_linked_invitations(uuid, uuid) to service_role'
		);
		expect(privilegeMigration).not.toContain(
			'grant execute on function public.reject_access_request_and_block_linked_invitations(uuid, uuid) to public'
		);
		expect(privilegeMigration).not.toMatch(/\bcreate\s+or\s+replace\s+function\b/);
		expect(privilegeMigration).not.toMatch(/\b(delete|insert|update)\s+(from\s+)?("?public"?\.)?"?access_requests"?/);
		expect(privilegeMigration).not.toMatch(
			/\b(delete|insert|update)\s+(from\s+)?("?public"?\.)?"?organization_invitations"?/
		);
	});
});
