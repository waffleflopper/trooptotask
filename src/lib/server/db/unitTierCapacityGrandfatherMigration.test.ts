import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260429000200_grandfather_existing_unit_tier_capacity.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('unit tier capacity grandfather migration', () => {
	it('keeps already-over-cap unit organizations writable after the pricing cap change', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."get_effective_tier"');
		expect(normalized).toContain("when 'unit' then greatest(500, v_personnel_count)");
		expect(normalized).toContain('v_is_read_only := v_personnel_count > v_cap');
	});
});
