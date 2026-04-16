import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260416000100_critical_tasks_read_models.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Critical Tasks read-model migration', () => {
	it('adds recency and trend indexes to support latest-status and trend reads', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('idx_personnel_ict_completions_org_person_task_recency');
		expect(normalized).toContain('idx_personnel_ict_completions_org_completed_at');
	});

	it('creates dedicated latest-completion and trend functions for active personnel and tasks', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."latest_active_personnel_ict_completions"');
		expect(normalized).toContain('returns setof "public"."personnel_ict_completions"');
		expect(normalized).toContain('distinct on ("pic"."personnel_id", "pic"."ict_task_id")');
		expect(normalized).toContain('create or replace function "public"."active_personnel_ict_completion_trend"');
		expect(normalized).toContain('returns table("month" "text", "completions" integer)');
		expect(normalized).toContain('"p"."archived_at" is null');
		expect(normalized).toContain('"t"."archived_at" is null');
		expect(normalized).toContain('coalesce(array_length("t"."mos", 1), 0) = 0');
		expect(normalized).toContain('from unnest("t"."mos") as "task_mos"("value")');
	});
});
