import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260423000300_ensure_rating_scheme_personnel_lookup.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Rating Scheme personnel lookup backfill migration', () => {
	it('runs after the initial Rating Scheme permission and helper hardening migrations', () => {
		expect(migrationFilename).toMatch(/^20260423000300_/);
	});

	it('creates the narrow personnel lookup RPC for databases that already applied the initial migration', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'drop policy if exists "users can view personnel if allowed by scoped rating scheme reference access" on "public"."personnel"'
		);
		expect(normalized).toContain('create or replace function "public"."list_rating_scheme_personnel_lookup"');
		expect(normalized).toContain('returns table("id" "uuid", "rank" "text", "last_name" "text", "first_name" "text")');
		expect(normalized).toContain('set "search_path" to \'\'');
		expect(normalized).toContain(
			'grant execute on function "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") to "authenticated"'
		);
		expect(normalized).toContain('notify "pgrst", \'reload schema\'');
	});
});
