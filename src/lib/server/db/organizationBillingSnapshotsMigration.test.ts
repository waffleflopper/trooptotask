import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260523000300_organization_billing_snapshots.sql'),
	'utf8'
);

function normalizedSql() {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('organization billing snapshots migration', () => {
	it('creates organization-scoped billing snapshot storage with safe defaults', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create table if not exists "public"."organization_billing_snapshots"');
		expect(normalized).toContain('"organization_id" uuid not null');
		expect(normalized).toContain('"commercial_plan" text not null default \'free\'::text');
		expect(normalized).toContain('"sync_status" text not null default \'not_configured\'::text');
		expect(normalized).toContain('"cancel_at_period_end" boolean not null default false');
		expect(normalized).toContain('"drift_detected" boolean not null default false');
	});

	it('stores Stripe identifiers, lifecycle timing, source, and sync health fields', () => {
		const normalized = normalizedSql();

		for (const field of [
			'stripe_customer_id',
			'stripe_subscription_id',
			'stripe_product_id',
			'stripe_price_id',
			'subscription_status',
			'collection_status',
			'current_period_start',
			'current_period_end',
			'canceled_at',
			'trial_end',
			'last_stripe_event_id',
			'last_reconciled_at',
			'reconciliation_result'
		]) {
			expect(normalized).toContain(`"${field}"`);
		}
	});

	it('constrains snapshot source, plan, subscription status, and sync status values', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain("'stripe'::text");
		expect(normalized).toContain("'gift'::text");
		expect(normalized).toContain("'billing_disabled'::text");
		expect(normalized).toContain("'legacy_organization'::text");
		expect(normalized).toContain("'team'::text");
		expect(normalized).toContain("'unit'::text");
		expect(normalized).toContain("'trialing'::text");
		expect(normalized).toContain("'incomplete_expired'::text");
		expect(normalized).toContain("'needs_reconciliation'::text");
	});

	it('allows members to read snapshots and limits writes to the service role', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('grant select on table "public"."organization_billing_snapshots" to "authenticated"');
		expect(normalized).toContain('grant all on table "public"."organization_billing_snapshots" to "service_role"');
		expect(normalized).toContain('using ("public"."is_org_member"("organization_id"))');
		expect(normalized).toContain('using (("auth"."role"() = \'service_role\'::text))');
	});
});
