import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260523000200_organization_invitation_outbox_attempt_increment.sql'),
	'utf8'
);

function normalizedSql() {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('organization invitation outbox attempt increment migration', () => {
	it('increments retry attempts in one database update', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'create or replace function "public"."mark_organization_invitation_email_outbox_delivery"'
		);
		expect(normalized).toContain('attempt_count = attempt_count + 1');
		expect(normalized).toContain('and attempt_count < 3');
		expect(normalized).toContain('returning *');
	});

	it('limits execution to the service role', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'revoke all on function "public"."mark_organization_invitation_email_outbox_delivery"(uuid, text, timestamp with time zone, text) from public'
		);
		expect(normalized).toContain(
			'grant execute on function "public"."mark_organization_invitation_email_outbox_delivery"(uuid, text, timestamp with time zone, text) to "service_role"'
		);
	});
});
