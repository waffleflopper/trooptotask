import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260423000200_rating_scheme_helper_search_path.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Rating Scheme helper search path migration', () => {
	it('runs after the initial rating-scheme permission lane migration', () => {
		expect(migrationFilename).toMatch(/^20260423000200_/);
	});

	it('pins search_path on the existing security definer rating-scheme helpers', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'alter function "public"."can_view_rating_scheme"("p_organization_id" "uuid") set "search_path" to \'\''
		);
		expect(normalized).toContain(
			'alter function "public"."can_edit_rating_scheme"("p_organization_id" "uuid") set "search_path" to \'\''
		);
		expect(normalized).toContain(
			'alter function "public"."can_view_rating_scheme_record"( "p_organization_id" "uuid", "p_rated_person_id" "uuid" ) set "search_path" to \'\''
		);
		expect(normalized).toContain(
			'alter function "public"."can_edit_rating_scheme_record"( "p_organization_id" "uuid", "p_rated_person_id" "uuid" ) set "search_path" to \'\''
		);
	});
});
