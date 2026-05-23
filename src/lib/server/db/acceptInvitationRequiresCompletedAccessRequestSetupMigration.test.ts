import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(
		process.cwd(),
		'supabase/migrations/20260522001000_accept_invitation_requires_completed_access_request_setup.sql'
	),
	'utf8'
).toLowerCase();

describe('accept organization invitation access request setup guard migration', () => {
	it('requires linked Access Request setup completion for the same normalized email before membership creation', () => {
		expect(migration).toContain('create or replace function "public"."accept_organization_invitation"');
		expect(migration).toContain('"access_request_organization_invitation_links"."organization_invitation_id"');
		expect(migration).toContain('join "public"."access_requests"');
		expect(migration).toContain('lower(btrim("access_requests"."email")) = "current_email"');
		expect(migration).toContain('"access_requests"."setup_completed_at" is not null');
		expect(migration).toContain('return query select \'setup_required\'::"text", null::"uuid"');
	});

	it('keeps membership creation in the invitation acceptance transition instead of account setup', () => {
		expect(migration).toContain('insert into "public"."organization_memberships"');
		expect(migration).toContain(
			'grant execute on function "public"."accept_organization_invitation"("uuid") to "authenticated"'
		);
	});

	it('returns blocked explicitly before the generic pending-status gate', () => {
		const blockedCheck = '"invitation"."status" = \'blocked\'::"public"."invitation_status"';
		const expiredCheck = '"invitation"."status" = \'expired\'::"public"."invitation_status"';

		expect(migration.indexOf(blockedCheck)).toBeGreaterThanOrEqual(0);
		expect(migration.indexOf(blockedCheck)).toBeLessThan(migration.indexOf(expiredCheck));
		expect(migration).toContain('return query select \'blocked\'::"text", "invitation"."organization_id"');
		expect(migration).toContain('"invitation"."status" <> \'pending\'::"public"."invitation_status"');
		expect(migration).toContain('return query select \'not_found\'::"text", null::"uuid"');
	});
});
