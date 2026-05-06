import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260504000200_duty_roster_template_pool_setup.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Duty Roster Template pool setup migration', () => {
	it('adds pool criteria, exemptions, and manual baseline setup storage', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."duty_roster_templates"');
		expect(normalized).toContain('"pool_criteria" "jsonb"');
		expect(normalized).toContain('"exempt_personnel_ids" "jsonb"');
		expect(normalized).toContain('"manual_baseline_counts" "jsonb"');
	});

	it('keeps setup values structured as JSON objects and arrays', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('"jsonb_typeof"("pool_criteria") = \'object\'::"text"');
		expect(normalized).toContain('"jsonb_typeof"("exempt_personnel_ids") = \'array\'::"text"');
		expect(normalized).toContain('"jsonb_typeof"("manual_baseline_counts") = \'object\'::"text"');
	});
});
