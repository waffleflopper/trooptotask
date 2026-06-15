import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260614000500_billing_snapshot_mirror_ordering.sql'),
	'utf8'
);

function normalizedMigration(): string {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('billing snapshot mirror ordering migration', () => {
	it('creates a service-role RPC that guards snapshot and mirror writes with event ordering', () => {
		const normalized = normalizedMigration();

		expect(normalized).toContain(
			'create or replace function "public"."upsert_organization_billing_snapshot_and_mirror_if_current"'
		);
		expect(normalized).toContain('security definer');
		expect(normalized).toContain('on conflict ("organization_id") do update');
		expect(normalized).toContain(
			'"organization_billing_snapshots"."last_stripe_event_created_at" < excluded."last_stripe_event_created_at"'
		);
		expect(normalized).toContain(
			'coalesce("organization_billing_snapshots"."last_stripe_event_id", \'\') <= coalesce(excluded."last_stripe_event_id", \'\')'
		);
		expect(normalized).toContain('if v_snapshot_row_count = 0 then return false');
		expect(normalized).toContain('update "public"."organizations"');
		expect(normalized).toContain('"tier" = case when "p_mirror" ? \'tier\'');
		expect(normalized).toContain('"stripe_customer_id" = case when "p_mirror" ? \'stripe_customer_id\'');
		expect(normalized).toContain('"stripe_subscription_id" = case when "p_mirror" ? \'stripe_subscription_id\'');
		expect(normalized).toContain('"subscription_status" = case when "p_mirror" ? \'subscription_status\'');
		expect(normalized).toContain('"current_period_end" = case when "p_mirror" ? \'current_period_end\'');
		expect(normalized).toContain(
			'revoke all on function "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(jsonb, jsonb) from public'
		);
		expect(normalized).toContain(
			'revoke all on function "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(jsonb, jsonb) from "anon"'
		);
		expect(normalized).toContain(
			'revoke all on function "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(jsonb, jsonb) from "authenticated"'
		);
		expect(normalized).toContain(
			'grant execute on function "public"."upsert_organization_billing_snapshot_and_mirror_if_current"(jsonb, jsonb) to "service_role"'
		);
	});
});
