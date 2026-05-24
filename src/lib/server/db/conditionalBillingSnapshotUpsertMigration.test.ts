import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260523000500_conditional_billing_snapshot_upsert.sql'),
	'utf8'
);

function normalizedMigration(): string {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('conditional billing snapshot upsert migration', () => {
	it('creates a service-role RPC that only overwrites stale or same-age billing snapshots', () => {
		const normalized = normalizedMigration();

		expect(normalized).toContain(
			'create or replace function "public"."upsert_organization_billing_snapshot_if_current"'
		);
		expect(normalized).toContain('on conflict ("organization_id") do update');
		expect(normalized).toContain(
			'"organization_billing_snapshots"."last_stripe_event_created_at" < excluded."last_stripe_event_created_at"'
		);
		expect(normalized).toContain(
			'coalesce("organization_billing_snapshots"."last_stripe_event_id", \'\') <= coalesce(excluded."last_stripe_event_id", \'\')'
		);
		expect(normalized).toContain('excluded."last_stripe_event_created_at" is not null');
		expect(normalized).toContain('get diagnostics v_row_count = row_count');
		expect(normalized).toContain(
			'grant execute on function "public"."upsert_organization_billing_snapshot_if_current"(jsonb) to "service_role"'
		);
	});
});
