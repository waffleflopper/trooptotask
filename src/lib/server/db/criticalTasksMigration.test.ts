import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260414000100_critical_tasks_foundation.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Critical Tasks foundation migration', () => {
	it('creates the ICT task and completion tables with the expected durable constraints', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create type "public"."ict_validation_method" as enum');
		expect(normalized).toContain('create table if not exists "public"."ict_tasks"');
		expect(normalized).toContain('create table if not exists "public"."personnel_ict_completions"');
		expect(normalized).toContain('add constraint "ict_tasks_organization_id_task_code_key" unique');
		expect(normalized).toContain('add constraint "personnel_ict_completions_org_person_task_date_key" unique');
		expect(normalized).toContain(
			'foreign key ("personnel_id") references "public"."personnel"("id") on delete cascade'
		);
		expect(normalized).toContain('foreign key ("ict_task_id") references "public"."ict_tasks"("id") on delete cascade');
		expect(normalized).toContain('foreign key ("logged_by") references "auth"."users"("id") on delete set null');
	});

	it('enables RLS and uses existing training permissions without new membership columns', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."ict_tasks" enable row level security');
		expect(normalized).toContain('alter table "public"."personnel_ict_completions" enable row level security');
		expect(normalized).toContain('for select using ("public"."can_view_training"("organization_id"))');
		expect(normalized).toContain('"public"."can_manage_training_configuration"("organization_id")');
		expect(normalized).toContain(
			'"public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id")'
		);
		expect(normalized).toContain(
			'"public"."can_view_personnel_ict_completion_record"("organization_id", "personnel_id")'
		);
		expect(normalized).not.toMatch(/alter table\s+"public"\."organization_memberships"\s+add column/);
		expect(normalized).not.toMatch(/can_(view|edit)_critical_tasks/);
	});
});
