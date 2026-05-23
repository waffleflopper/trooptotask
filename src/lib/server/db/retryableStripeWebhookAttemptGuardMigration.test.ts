import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260523000700_retryable_stripe_webhook_attempt_guard.sql'),
	'utf8'
);

function normalizedMigration(): string {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('retryable Stripe webhook attempt guard migration', () => {
	it('creates a service-role RPC that only increments retryable failed webhook events', () => {
		const normalized = normalizedMigration();

		expect(normalized).toContain('create or replace function "public"."record_retryable_stripe_webhook_event_attempt"');
		expect(normalized).toContain('update "public"."stripe_webhook_events"');
		expect(normalized).toContain('"attempt_count" = "stripe_webhook_events"."attempt_count" + 1');
		expect(normalized).toContain('"processed" is not true');
		expect(normalized).toContain('"processing_state" = \'retryable_failed\'::text');
		expect(normalized).toContain('returning "attempt_count" into v_attempt_count');
		expect(normalized).toContain(
			'grant execute on function "public"."record_retryable_stripe_webhook_event_attempt"(text, text, jsonb, text, text, timestamp with time zone) to "service_role"'
		);
	});
});
