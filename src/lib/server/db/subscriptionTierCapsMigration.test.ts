import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260429000100_update_subscription_tier_caps.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('subscription tier caps migration', () => {
	it('updates the database read-only caps to match the public pricing tiers', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."get_effective_tier"');
		expect(normalized).toContain("when 'free' then 20");
		expect(normalized).toContain("when 'team' then 80");
		expect(normalized).toContain("when 'unit' then 500");
		expect(normalized).toContain('v_is_read_only := v_personnel_count > v_cap');
	});
});
