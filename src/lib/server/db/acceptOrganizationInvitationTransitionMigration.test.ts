import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260522000600_accept_organization_invitation_transition.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

// These migration tests are static guardrails. Runtime RPC concurrency still needs a live
// database verification pass when the local Supabase stack is available.
function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('accept organization invitation transition migration', () => {
	it('creates an authenticated database transition that locks the invitation row', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."accept_organization_invitation"');
		expect(normalized).toContain('returns table("accept_status" "text", "accepted_organization_id" "uuid")');
		expect(normalized).toContain('security definer');
		expect(normalized).toContain('"auth"."uid"()');
		expect(normalized).toContain('"auth"."jwt"() ->> \'email\'');
		expect(normalized).toContain('for update');
		expect(normalized).toContain(
			'grant execute on function "public"."accept_organization_invitation"("uuid") to "authenticated"'
		);
	});

	it('verifies pending, unexpired, same-email invitations and handles deterministic non-success states', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('"invitation"."normalized_email" <> "current_email"');
		expect(normalized).toContain('"invitation"."status" = \'accepted\'::"public"."invitation_status"');
		expect(normalized).toContain('"invitation"."status" = \'expired\'::"public"."invitation_status"');
		expect(normalized).toContain('"invitation"."expires_at" <= now()');
		expect(normalized).toContain('"expired_at" = coalesce("organization_invitations"."expired_at", now())');
		expect(normalized).toContain('"invitation"."status" <> \'pending\'::"public"."invitation_status"');
		expect(normalized).toContain('\'already_member\'::"text"');
		expect(normalized).toContain('\'already_accepted\'::"text"');
	});

	it('copies the stored invitation access snapshot into membership and marks the invitation accepted', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('insert into "public"."organization_memberships"');
		expect(normalized).toContain('"role"');
		expect(normalized).toContain('coalesce("invitation"."role", \'member\'::"public"."organization_role")');
		expect(normalized).toContain('"member_preset"');
		expect(normalized).toContain('"capability_overrides"');
		expect(normalized).toContain('"access_scope_kind"');
		expect(normalized).toContain('"access_scope_group_ids"');
		expect(normalized).toContain('on conflict ("organization_id", "user_id") do nothing');
		expect(normalized).toContain('update "public"."organization_invitations"');
		expect(normalized).toContain('"status" = \'accepted\'::"public"."invitation_status"');
		expect(normalized).toContain('"accepted_at" = now()');
		expect(normalized).toContain('"accepted_by" = "current_user_id"');
		expect(normalized).not.toContain('delete from "public"."organization_invitations"');
	});
});
