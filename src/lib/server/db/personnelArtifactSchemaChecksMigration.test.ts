import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260515001100_personnel_artifact_schema_checks.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('personnel artifact schema checks migration', () => {
	it('prevents negative Soldier Data Sheet dependent counts below the service layer', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('personnel_extended_info_number_of_dependents_nonnegative');
		expect(normalized).toContain('check ("number_of_dependents" is null or "number_of_dependents" >= 0)');
	});

	it('prevents blank leader note text below the service layer', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('leader_notes_text_not_blank');
		expect(normalized).toContain('check (length(btrim("text")) > 0)');
	});
});
