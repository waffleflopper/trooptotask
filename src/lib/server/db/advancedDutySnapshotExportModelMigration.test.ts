import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260503000300_normalize_advanced_duty_snapshot_export_model.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Advanced Duty Run snapshot export model migration', () => {
	it('runs after the advanced duty revision storage migration', () => {
		expect(migrationFilename).toMatch(/^20260503000300_/);
	});

	it('normalizes JSON null export models before inserting draft snapshots', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."replace_advanced_duty_run_snapshot"');
		expect(normalized).toContain("jsonb_typeof(\"p_snapshot_data\" -> 'export_model') = 'null'");
		expect(normalized).toContain('then null');
		expect(normalized).toContain('else "p_snapshot_data" -> \'export_model\'');
		expect(normalized).toContain('grant all on function "public"."replace_advanced_duty_run_snapshot"');
	});
});
