import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260503000100_advanced_duty_snapshot_lineage_replacement.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Advanced Duty Run snapshot lineage replacement migration', () => {
	it('runs as a forward migration after the original snapshot table migration', () => {
		expect(migrationFilename).toMatch(/^20260503000100_/);
	});

	it('adds and backfills the draft lineage key before enforcing not null', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'alter table "public"."advanced_duty_run_snapshots" add column if not exists "draft_lineage_key" "text"'
		);
		expect(normalized).toContain('"template_id"::"text" || \':\' || "pattern" || \':\'');
		expect(normalized).toContain('jsonb_array_elements_text');
		expect(normalized).toContain('order by "dates"."ordinality"');
		expect(normalized).toContain('where "draft_lineage_key" is null');
		expect(normalized).toContain(
			'alter table "public"."advanced_duty_run_snapshots" alter column "draft_lineage_key" set not null'
		);
	});

	it('deduplicates existing draft rows before creating the one-current-draft index', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('row_number"() over');
		expect(normalized).toContain('partition by "organization_id", "draft_lineage_key"');
		expect(normalized).toContain('order by "created_at" desc, "id" desc');
		expect(normalized).toContain('and "ranked_drafts"."draft_rank" > 1');
		expect(normalized).toContain(
			'create unique index if not exists "advanced_duty_run_snapshots_current_draft_lineage_key" on "public"."advanced_duty_run_snapshots" using "btree" ("organization_id", "draft_lineage_key") where ("status" = \'draft\'::"text")'
		);
	});

	it('adds atomic draft replacement through a locked RPC', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."replace_advanced_duty_run_snapshot"');
		expect(normalized).toContain('pg_advisory_xact_lock');
		expect(normalized).toContain('"draft_lineage_key" = "p_draft_lineage_key"');
		expect(normalized).toContain('"p_draft_lineage_key"');
		expect(normalized).toContain(
			'grant all on function "public"."replace_advanced_duty_run_snapshot"("p_org_id" "uuid", "p_draft_lineage_key" "text", "p_snapshot_data" "jsonb") to "authenticated"'
		);
		expect(normalized).not.toContain('limit 100');
	});
});
