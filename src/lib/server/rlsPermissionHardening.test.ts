import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20260403_core_rls_permission_hardening.sql');

describe('core RLS permission hardening migration', () => {
	it('requires edit-level training permission for sign-in roster inserts', () => {
		const sql = readFileSync(migrationPath, 'utf8');
		const signInRosterInsertBlock =
			sql.match(
				/CREATE POLICY "sign_in_rosters_insert" ON "public"\."sign_in_rosters"[\s\S]*?WITH CHECK \(([\s\S]*?)\);/
			)?.[0] ?? '';

		expect(sql).toContain('DROP POLICY IF EXISTS "sign_in_rosters_insert" ON "public"."sign_in_rosters";');
		expect(sql).toContain('CREATE POLICY "sign_in_rosters_insert" ON "public"."sign_in_rosters"');
		expect(signInRosterInsertBlock).toContain('"public"."can_edit_training"("organization_id")');
		expect(signInRosterInsertBlock).not.toContain('"public"."can_view_training"("organization_id")');
	});

	it('enforces scoped personnel visibility and edit access through dedicated helper functions', () => {
		const sql = readFileSync(migrationPath, 'utf8');

		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_personnel_record"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_record"');
		expect(sql).toContain('("organization_memberships"."scoped_group_id" IS NULL)');
		expect(sql).toContain('("p_group_id" IS NULL)');
		expect(sql).toContain('("organization_memberships"."scoped_group_id" = "p_group_id")');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can view personnel" ON "public"."personnel";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can insert personnel" ON "public"."personnel";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can update personnel" ON "public"."personnel";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can delete personnel" ON "public"."personnel";');
		expect(sql).toContain(
			'CREATE POLICY "Users can view personnel if allowed by scoped personnel access" ON "public"."personnel"'
		);
		expect(sql).toContain('"public"."can_view_personnel_record"("organization_id", "group_id")');
		expect(sql).toContain(
			'CREATE POLICY "Users can insert personnel if allowed by scoped personnel access" ON "public"."personnel"'
		);
		expect(sql).toContain('"public"."can_edit_personnel_record"("organization_id", "group_id")');
	});

	it('enforces scoped training-record access for personnel training rows', () => {
		const sql = readFileSync(migrationPath, 'utf8');

		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_personnel_training_record"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_training_record"');
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can view personnel trainings" ON "public"."personnel_trainings";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can insert personnel trainings" ON "public"."personnel_trainings";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can update personnel trainings" ON "public"."personnel_trainings";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can delete personnel trainings" ON "public"."personnel_trainings";'
		);
		expect(sql).toContain(
			'CREATE POLICY "Users can view personnel trainings if allowed by scoped training access" ON "public"."personnel_trainings"'
		);
		expect(sql).toContain('"public"."can_view_personnel_training_record"("organization_id", "personnel_id")');
		expect(sql).toContain(
			'CREATE POLICY "Users can insert personnel trainings if allowed by scoped training access" ON "public"."personnel_trainings"'
		);
		expect(sql).toContain('"public"."can_edit_personnel_training_record"("organization_id", "personnel_id")');
	});

	it('enforces scoped calendar access for availability entries', () => {
		const sql = readFileSync(migrationPath, 'utf8');

		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_availability_record"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_availability_record"');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can view availability" ON "public"."availability_entries";');
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can insert availability" ON "public"."availability_entries";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can update availability" ON "public"."availability_entries";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can delete availability" ON "public"."availability_entries";'
		);
		expect(sql).toContain(
			'CREATE POLICY "Users can view availability if allowed by scoped calendar access" ON "public"."availability_entries"'
		);
		expect(sql).toContain('"public"."can_view_availability_record"("organization_id", "personnel_id")');
		expect(sql).toContain(
			'CREATE POLICY "Users can insert availability if allowed by scoped calendar access" ON "public"."availability_entries"'
		);
		expect(sql).toContain('"public"."can_edit_availability_record"("organization_id", "personnel_id")');
	});

	it('enforces scoped calendar access for daily assignments through assignee-aware policies', () => {
		const sql = readFileSync(migrationPath, 'utf8');

		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_daily_assignment_record"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_daily_assignment_record"');
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can view daily assignments" ON "public"."daily_assignments";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can insert daily assignments" ON "public"."daily_assignments";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can update daily assignments" ON "public"."daily_assignments";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can delete daily assignments" ON "public"."daily_assignments";'
		);
		expect(sql).toContain(
			'CREATE POLICY "Users can view daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"'
		);
		expect(sql).toContain('"public"."can_view_daily_assignment_record"("organization_id", "assignee_id")');
		expect(sql).toContain(
			'CREATE POLICY "Users can insert daily assignments if allowed by scoped calendar access" ON "public"."daily_assignments"'
		);
		expect(sql).toContain('"public"."can_edit_daily_assignment_record"("organization_id", "assignee_id")');
	});

	it('restricts groups to legitimate viewers and personnel editors', () => {
		const sql = readFileSync(migrationPath, 'utf8');

		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_groups"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_manage_groups"');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can view groups" ON "public"."groups";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members and creators can insert groups" ON "public"."groups";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can update groups" ON "public"."groups";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can delete groups" ON "public"."groups";');
		expect(sql).toContain(
			'CREATE POLICY "Users can view groups if they can access related workspaces" ON "public"."groups"'
		);
		expect(sql).toContain('"public"."can_view_groups"("organization_id")');
		expect(sql).toContain('CREATE POLICY "Users can manage groups if they can edit personnel" ON "public"."groups"');
		expect(sql).toContain('"public"."can_manage_groups"("organization_id")');
	});

	it('requires calendar view permission for special-day reads and calendar edit for writes', () => {
		const sql = readFileSync(migrationPath, 'utf8');

		expect(sql).toContain('DROP POLICY IF EXISTS "Members can view special days" ON "public"."special_days";');
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members and creators can insert special days" ON "public"."special_days";'
		);
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can update special days" ON "public"."special_days";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can delete special days" ON "public"."special_days";');
		expect(sql).toContain(
			'CREATE POLICY "Users can view special days if they can view calendar data" ON "public"."special_days"'
		);
		expect(sql).toContain(
			'CREATE POLICY "Users can manage special days if they can edit calendar data" ON "public"."special_days"'
		);
		expect(sql).toContain('"public"."can_view_calendar"("organization_id")');
		expect(sql).toContain('"public"."can_edit_calendar"("organization_id")');
	});

	it('requires view-specific access for type reads and full-editor access for type writes', () => {
		const sql = readFileSync(migrationPath, 'utf8');

		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."is_full_editor_for_org"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_manage_calendar_configuration"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_manage_training_configuration"');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can view assignment types" ON "public"."assignment_types";');
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members and creators can insert assignment types" ON "public"."assignment_types";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can update assignment types" ON "public"."assignment_types";'
		);
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members can delete assignment types" ON "public"."assignment_types";'
		);
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can view status types" ON "public"."status_types";');
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members and creators can insert status types" ON "public"."status_types";'
		);
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can update status types" ON "public"."status_types";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can delete status types" ON "public"."status_types";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can view training types" ON "public"."training_types";');
		expect(sql).toContain(
			'DROP POLICY IF EXISTS "Members and creators can insert training types" ON "public"."training_types";'
		);
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can update training types" ON "public"."training_types";');
		expect(sql).toContain('DROP POLICY IF EXISTS "Members can delete training types" ON "public"."training_types";');
		expect(sql).toContain(
			'CREATE POLICY "Users can view assignment types if they can view calendar data" ON "public"."assignment_types"'
		);
		expect(sql).toContain(
			'CREATE POLICY "Users can manage assignment types if they are full editors" ON "public"."assignment_types"'
		);
		expect(sql).toContain(
			'CREATE POLICY "Users can view status types if they can view calendar data" ON "public"."status_types"'
		);
		expect(sql).toContain(
			'CREATE POLICY "Users can manage status types if they are full editors" ON "public"."status_types"'
		);
		expect(sql).toContain(
			'CREATE POLICY "Users can view training types if they can view training data" ON "public"."training_types"'
		);
		expect(sql).toContain(
			'CREATE POLICY "Users can manage training types if they are full editors" ON "public"."training_types"'
		);
	});
});
