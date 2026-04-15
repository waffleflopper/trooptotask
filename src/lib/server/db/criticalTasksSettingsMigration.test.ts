import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260414000400_critical_tasks_settings.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Critical Tasks settings migration', () => {
	it('adds organization-level Critical Tasks settings columns', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'alter table "public"."organizations" add column if not exists "critical_tasks_default_expiration_months" integer'
		);
		expect(normalized).toContain(
			'alter table "public"."organizations" add column if not exists "critical_tasks_expiring_soon_warning_days" integer'
		);
	});

	it('keeps the settings nullable while enforcing sane positive ranges', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('organizations_critical_tasks_default_expiration_months_check');
		expect(normalized).toContain('critical_tasks_default_expiration_months" between 1 and 120');
		expect(normalized).toContain('organizations_critical_tasks_expiring_soon_warning_days_check');
		expect(normalized).toContain('critical_tasks_expiring_soon_warning_days" between 1 and 365');
	});
});
