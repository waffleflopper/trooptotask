import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260417000100_critical_tasks_task_category.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Critical Tasks task category migration', () => {
	it('adds optional free-text ICT task categories for report grouping', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."ict_tasks" add column if not exists "category" "text"');
		expect(normalized).toContain('idx_ict_tasks_org_category');
	});
});
