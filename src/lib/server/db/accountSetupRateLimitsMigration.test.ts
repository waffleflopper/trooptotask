import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260522000200_account_setup_rate_limits.sql'),
	'utf8'
);

function normalizedSql(): string {
	return sql.replace(/\s+/g, ' ').trim().toLowerCase();
}

describe('Account Setup rate limits migration', () => {
	it('stores account setup rate-limit buckets in shared database storage', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create table if not exists "public"."account_setup_rate_limits"');
		expect(normalized).toContain('"bucket_key" text primary key');
		expect(normalized).toContain('"request_count" integer not null');
		expect(normalized).toContain('"reset_at" timestamp with time zone not null');
		expect(normalized).toContain('alter table "public"."account_setup_rate_limits" enable row level security');
	});

	it('provides an atomic shared counter RPC restricted to the service role', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."check_account_setup_rate_limit"');
		expect(normalized).toContain('on conflict ("bucket_key") do update');
		expect(normalized).toContain('when "account_setup_rate_limits"."reset_at" < "p_checked_at" then 1');
		expect(normalized).toContain(
			'revoke all on function "public"."check_account_setup_rate_limit"(text, integer, integer, timestamp with time zone) from "anon"'
		);
		expect(normalized).toContain(
			'grant execute on function "public"."check_account_setup_rate_limit"(text, integer, integer, timestamp with time zone) to "service_role"'
		);
	});
});
