import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
	join(process.cwd(), 'supabase/migrations/20260523000600_billing_snapshot_effective_tier_policy.sql'),
	'utf8'
);

function normalizedMigration(): string {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('billing snapshot effective tier policy migration', () => {
	it('derives effective access from billing snapshots before legacy organization fields', () => {
		const normalized = normalizedMigration();

		expect(normalized).toContain('create or replace function "public"."get_effective_tier"');
		expect(normalized).toContain('from "public"."organization_billing_snapshots"');
		expect(normalized).toContain('set "search_path" = "public"');
		expect(normalized).toContain('not "public"."is_org_member"("p_org_id")');
		expect(normalized).toContain(
			'grant execute on function "public"."get_effective_tier"("p_org_id" "uuid") to "authenticated"'
		);
		expect(normalized).toContain('revoke all on function "public"."get_effective_tier"("p_org_id" "uuid") from "anon"');
		expect(normalized).toContain("'past_due'");
		expect(normalized).toContain("v_read_only_reason := 'payment_failure'");
		expect(normalized).toContain("'unpaid'::text");
		expect(normalized).toContain("'incomplete_expired'::text");
		expect(normalized).toContain("'readonlyreason'");
		expect(normalized).toContain("v_read_only_reason, 'personnel_limit'");
	});
});
