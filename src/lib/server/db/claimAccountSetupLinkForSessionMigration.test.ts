import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260523000100_claim_account_setup_link_for_session.sql'),
	'utf8'
);

function normalizedSql() {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('claim Account Setup Link for session migration', () => {
	it('creates a security-definer RPC that locks the setup link and Access Request rows', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."claim_account_setup_link_for_session"');
		expect(normalized).toContain('security definer');
		expect(normalized).toContain('set search_path = public');
		expect(normalized).toContain('from public.account_setup_links');
		expect(normalized).toContain('for update');
		expect(normalized).toContain('from public.access_requests');
	});

	it('returns explicit setup claim statuses without selecting raw token hashes', () => {
		const normalized = normalizedSql();

		for (const status of [
			'claim-started',
			'missing',
			'expired',
			'revoked',
			'replaced',
			'used',
			'claimed',
			'failed',
			'access-request-not-approved',
			'access-request-completed'
		]) {
			expect(normalized).toContain(`'${status}'::text`);
		}
		expect(normalized).not.toContain('token_hash');
		expect(normalized).not.toContain('setup_url');
	});

	it('only grants the claim RPC to the service role', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'revoke all on function "public"."claim_account_setup_link_for_session"(uuid, uuid, timestamp with time zone) from public'
		);
		expect(normalized).toContain(
			'grant execute on function "public"."claim_account_setup_link_for_session"(uuid, uuid, timestamp with time zone) to "service_role"'
		);
	});
});
