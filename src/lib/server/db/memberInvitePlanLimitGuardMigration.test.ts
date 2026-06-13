import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260524000300_member_invite_plan_limit_guard.sql'),
	'utf8'
).toLowerCase();

const privilegeMigration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260613000100_restrict_service_role_mutation_rpc_grants.sql'),
	'utf8'
).toLowerCase();

describe('member invite plan limit guard migration', () => {
	it('serializes organization member-cap enforcement with an advisory lock', () => {
		expect(migration).toContain('create or replace function "public"."block_invitation_if_member_cap_exceeded"');
		expect(migration).toContain('"pg_advisory_xact_lock"("hashtextextended"("p_org_id"::text, 1068))');
		expect(migration).toContain('from "public"."organization_memberships"');
		expect(migration).toContain('from "public"."organization_invitations"');
		expect(migration).toContain('count(distinct "organization_invitations"."normalized_email")');
		expect(migration).toContain('"organization_invitations"."status" = \'pending\'::"public"."invitation_status"');
		expect(migration).toContain('"organization_invitations"."expires_at" is null');
	});

	it('blocks only the just-created pending invitation and limits execution to service role', () => {
		expect(migration).toContain('"status" = \'blocked\'::"public"."invitation_status"');
		expect(migration).toContain('"blocked_at" = now()');
		expect(migration).toContain('"blocked_by" = "p_blocked_by"');
		expect(migration).toContain('"organization_invitations"."id" = "p_invitation_id"');
		expect(migration).toContain('"organization_invitations"."organization_id" = "p_org_id"');
		expect(migration).toContain(
			'grant execute on function "public"."block_invitation_if_member_cap_exceeded"("uuid", "uuid", "uuid", integer, text) to "service_role"'
		);
		expect(migration).not.toContain(
			'grant execute on function "public"."block_invitation_if_member_cap_exceeded"("uuid", "uuid", "uuid", integer, text) to "authenticated"'
		);
	});

	it('revokes direct client execution in the follow-up privilege migration', () => {
		expect(privilegeMigration).toContain(
			'revoke all on function public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) from public'
		);
		expect(privilegeMigration).toContain(
			'revoke all on function public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) from anon'
		);
		expect(privilegeMigration).toContain(
			'revoke all on function public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) from authenticated'
		);
		expect(privilegeMigration).toContain(
			'grant execute on function public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) to service_role'
		);
		expect(privilegeMigration).not.toContain(
			'grant execute on function public.block_invitation_if_member_cap_exceeded(uuid, uuid, uuid, integer, text) to public'
		);
		expect(privilegeMigration).not.toMatch(/\bcreate\s+or\s+replace\s+function\b/);
		expect(privilegeMigration).not.toMatch(/\b(delete|insert|update)\s+(from\s+)?("?public"?\.)?"?access_requests"?/);
		expect(privilegeMigration).not.toMatch(
			/\b(delete|insert|update)\s+(from\s+)?("?public"?\.)?"?organization_invitations"?/
		);
	});
});
