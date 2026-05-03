import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260423000200_rating_scheme_helper_search_path.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Rating Scheme helper search path migration', () => {
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
