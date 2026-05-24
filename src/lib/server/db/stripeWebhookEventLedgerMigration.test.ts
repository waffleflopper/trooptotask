import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260523000400_stripe_webhook_event_ledger.sql'),
	'utf8'
);

function normalizedSql() {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('stripe webhook event ledger migration', () => {
	it('adds durable processing-state and diagnostic fields to the webhook ledger', () => {
		const normalized = normalizedSql();

		for (const field of [
			'object_id',
			'secondary_dedupe_key',
			'event_created_at',
			'processing_state',
			'attempt_count',
			'last_error',
			'processing_result',
			'updated_at'
		]) {
			expect(normalized).toContain(`"${field}"`);
		}
	});

	it('constrains webhook processing to the explicit billing states', () => {
		const normalized = normalizedSql();

		for (const state of ['processed', 'ignored', 'retryable_failed', 'permanently_failed', 'superseded']) {
			expect(normalized).toContain(`'${state}'::text`);
		}

		expect(normalized).toContain('"attempt_count" >= 0');
	});

	it('keeps support queries efficient and limits table access to the service role', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('stripe_webhook_events_processing_state_idx');
		expect(normalized).toContain('stripe_webhook_events_secondary_dedupe_idx');
		expect(normalized).toContain('revoke all on table "public"."stripe_webhook_events" from "anon"');
		expect(normalized).toContain('revoke all on table "public"."stripe_webhook_events" from "authenticated"');
		expect(normalized).toContain('grant all on table "public"."stripe_webhook_events" to "service_role"');
	});

	it('backfills legacy rows and records attempts with an atomic upsert function', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('update "public"."stripe_webhook_events" set');
		expect(normalized).toContain('when "processed" is true then \'processed\'::text');
		expect(normalized).toContain('create or replace function "public"."record_stripe_webhook_event_attempt"');
		expect(normalized).toContain('on conflict ("id") do update');
		expect(normalized).toContain('"attempt_count" = "stripe_webhook_events"."attempt_count" + 1');
		expect(normalized).toContain(
			"where \"stripe_webhook_events\".\"processing_state\" not in ( 'processed'::text, 'ignored'::text, 'permanently_failed'::text, 'superseded'::text )"
		);
		expect(normalized).toContain(
			'grant execute on function "public"."record_stripe_webhook_event_attempt"(text, text, jsonb, text, text, timestamp with time zone) to "service_role"'
		);
	});
});
