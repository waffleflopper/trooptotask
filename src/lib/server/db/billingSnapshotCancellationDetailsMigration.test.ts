import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260524000700_billing_snapshot_cancellation_details.sql'),
	'utf8'
);

function normalizedMigration(): string {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('billing snapshot cancellation details migration', () => {
	it('adds safe cancellation metadata fields and keeps the conditional upsert current', () => {
		const normalized = normalizedMigration();

		expect(normalized).toContain('add column if not exists "cancellation_reason" text');
		expect(normalized).toContain('add column if not exists "cancellation_feedback" text');
		expect(normalized).toContain('"cancellation_reason" = excluded."cancellation_reason"');
		expect(normalized).toContain('"cancellation_feedback" = excluded."cancellation_feedback"');
		expect(normalized).toContain("'cancellation_requested'::text");
		expect(normalized).toContain("'too_expensive'::text");
		expect(normalized).toContain(
			'revoke all on function "public"."upsert_organization_billing_snapshot_if_current"(jsonb) from public'
		);
		expect(normalized).toContain(
			'grant execute on function "public"."upsert_organization_billing_snapshot_if_current"(jsonb) to "service_role"'
		);
	});
});
