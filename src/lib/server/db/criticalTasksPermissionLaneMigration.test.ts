import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260421000100_critical_tasks_permission_lane.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Critical Tasks permission-lane migration', () => {
	it('uses the next ordered timestamp after the task-category slice', () => {
		expect(migrationFilename).toMatch(/^20260421000100_/);
	});

	it('adds and backfills dedicated critical tasks permission columns', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'alter table "public"."organization_memberships" add column if not exists "can_view_critical_tasks" boolean'
		);
		expect(normalized).toContain('add column if not exists "can_edit_critical_tasks" boolean');
		expect(normalized).toContain(
			'alter table "public"."organization_invitations" add column if not exists "can_view_critical_tasks" boolean'
		);
		expect(normalized).toContain('coalesce("can_view_critical_tasks", "can_view_training", false)');
		expect(normalized).toContain('coalesce("can_edit_critical_tasks", "can_edit_training", false)');
		expect(normalized).toContain('alter column "can_view_critical_tasks" set not null');
		expect(normalized).toContain('alter column "can_edit_critical_tasks" set not null');
	});

	it('switches critical tasks RLS helpers and read policies onto the dedicated lane', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."can_view_critical_tasks"');
		expect(normalized).toContain('create or replace function "public"."can_edit_critical_tasks"');
		expect(normalized).toContain('"organization_memberships"."can_view_critical_tasks" = true');
		expect(normalized).toContain('"organization_memberships"."can_edit_critical_tasks" = true');
		expect(normalized).toContain(
			'drop policy if exists "users can view ict tasks if they can view training data" on "public"."ict_tasks"'
		);
		expect(normalized).toContain('using ("public"."can_view_critical_tasks"("organization_id"))');
		expect(normalized).toContain(
			'create policy "users can view personnel ict completions if allowed by scoped critical tasks access"'
		);
		expect(normalized).not.toContain('can_manage_training_configuration');
	});
});
