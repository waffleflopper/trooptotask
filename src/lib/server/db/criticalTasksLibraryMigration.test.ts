import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260414000200_critical_tasks_library_admin_crud.sql';
const softArchivePolicyMigrationFilename = '20260414000300_critical_tasks_library_soft_archive_policy.sql';
const helperSearchPathMigrationFilename = '20260612000100_pin_ict_task_library_helper_search_path.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const softArchivePolicyMigrationPath = join(process.cwd(), 'supabase/migrations', softArchivePolicyMigrationFilename);
const helperSearchPathMigrationPath = join(process.cwd(), 'supabase/migrations', helperSearchPathMigrationFilename);
const sql = readFileSync(migrationPath, 'utf8');
const softArchivePolicySql = readFileSync(softArchivePolicyMigrationPath, 'utf8');
const helperSearchPathSql = readFileSync(helperSearchPathMigrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

function normalizedSoftArchivePolicySql() {
	return softArchivePolicySql.replace(/\s+/g, ' ').toLowerCase();
}

function normalizedHelperSearchPathSql() {
	return helperSearchPathSql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Critical Tasks task library migration', () => {
	it('uses the next ordered same-day timestamp so local migrations apply after the foundation slice', () => {
		expect(migrationFilename).toMatch(/^20260414000200_/);
		expect(softArchivePolicyMigrationFilename).toMatch(/^20260414000300_/);
	});

	it('adds durable task-library metadata for admin CRUD', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."ict_tasks" add column if not exists "description" "text"');
		expect(normalized).toContain('alter table "public"."ict_tasks" add column if not exists "sort_order" integer');
		expect(normalized).toContain('default 0');
		expect(normalized).toContain('idx_ict_tasks_org_sort_code');
	});

	it('replaces full-editor task management with owner/admin-only RLS', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'drop policy if exists "users can manage ict tasks if they can manage training config" on "public"."ict_tasks"'
		);
		expect(normalized).toContain('create or replace function "public"."can_manage_ict_task_library"');
		expect(normalized).toContain('"organization_memberships"."role" in (\'owner\', \'admin\')');
		expect(normalized).toContain('create policy "owners and admins can manage ict task library"');
		expect(normalized).not.toContain('"public"."can_manage_training_configuration"("organization_id")');
		expect(normalized).not.toMatch(/alter table\s+"public"\."organization_memberships"\s+add column/);
	});

	it('narrows task-library writes to insert and update so archive remains soft-delete only', () => {
		const normalized = normalizedSoftArchivePolicySql();

		expect(normalized).toContain(
			'drop policy if exists "owners and admins can manage ict task library" on "public"."ict_tasks"'
		);
		expect(normalized).toContain('for insert');
		expect(normalized).toContain('for update');
		expect(normalized).not.toContain('for delete');
	});

	it('pins the task-library RLS helper search path without changing role semantics', () => {
		const normalized = normalizedHelperSearchPathSql();

		expect(helperSearchPathMigrationFilename).toMatch(/^20260612000100_/);
		expect(normalized).toContain('can_manage_ict_task_library');
		expect(normalized).toContain('set search_path = public, pg_temp');
		expect(normalized).not.toContain("'owner'");
		expect(normalized).not.toContain("'admin'");
		expect(normalized).not.toContain('organization_memberships');
		expect(normalized).not.toMatch(/\b(create|alter|drop)\s+table\b/);
	});
});
