import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260524000300_member_invite_plan_limit_guard.sql'),
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
});
