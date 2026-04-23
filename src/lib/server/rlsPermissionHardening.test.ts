import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationsPath = resolve(process.cwd(), 'supabase/migrations');
const sql = readdirSync(migrationsPath)
	.filter((file) => file.endsWith('.sql'))
	.sort()
	.map((file) => readFileSync(resolve(migrationsPath, file), 'utf8'))
	.join('\n\n');

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getPolicyBlock(table: string, action: string | null, expectedPredicate: string): string {
	const actionPattern = action ? `(?:\\s+FOR ${action})` : '(?:\\s+FOR [A-Z]+)?';
	const tablePattern = `(?:"public"\\."${table}"|public\\.${table})`;
	const match = sql.match(
		new RegExp(
			`CREATE POLICY "[^"]+"\\s+ON\\s+${tablePattern}${actionPattern}[\\s\\S]*?${escapeRegex(expectedPredicate)}[\\s\\S]*?;`,
			'i'
		)
	);

	return match?.[0] ?? '';
}

function expectPolicyUses(table: string, action: string | null, expectedPredicate: string): void {
	expect(getPolicyBlock(table, action, expectedPredicate)).not.toBe('');
}

describe('core RLS permission hardening migration', () => {
	it('requires edit-level training permission for sign-in roster inserts', () => {
		const signInRosterInsertBlock = getPolicyBlock(
			'sign_in_rosters',
			'INSERT',
			'"public"."can_edit_training"("organization_id")'
		);

		expect(signInRosterInsertBlock).toContain('"public"."can_edit_training"("organization_id")');
		expect(signInRosterInsertBlock).not.toContain('"public"."can_view_training"("organization_id")');
	});

	it('enforces scoped personnel visibility and edit access through dedicated helper functions', () => {
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_personnel_record"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_record"');
		expect(sql).toContain('("organization_memberships"."scoped_group_id" IS NULL)');
		expect(sql).toContain('("p_group_id" IS NULL)');
		expect(sql).toContain('("organization_memberships"."scoped_group_id" = "p_group_id")');
		expectPolicyUses('personnel', 'SELECT', '"public"."can_view_personnel_record"("organization_id", "group_id")');
		expectPolicyUses('personnel', 'INSERT', '"public"."can_edit_personnel_record"("organization_id", "group_id")');
		expectPolicyUses('personnel', 'UPDATE', '"public"."can_edit_personnel_record"("organization_id", "group_id")');
		expectPolicyUses('personnel', 'DELETE', '"public"."can_edit_personnel_record"("organization_id", "group_id")');
	});

	it('keeps rating-scheme roster references behind a narrow lookup RPC instead of Personnel SELECT', () => {
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."list_rating_scheme_personnel_lookup"');
		expect(sql).toContain(
			'GRANT EXECUTE ON FUNCTION "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") TO "authenticated"'
		);
		expect(sql).not.toContain(
			'CREATE POLICY "Users can view personnel if allowed by scoped rating scheme reference access"'
		);
		expect(
			getPolicyBlock(
				'personnel',
				'SELECT',
				'"public"."can_view_rating_scheme_personnel_record"("organization_id", "group_id")'
			)
		).toBe('');
	});

	it('enforces scoped rating-scheme access through dedicated helper functions', () => {
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_rating_scheme"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_rating_scheme"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_rating_scheme_record"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_rating_scheme_record"');
		expectPolicyUses(
			'rating_scheme_entries',
			'SELECT',
			'"public"."can_view_rating_scheme_record"("organization_id", "rated_person_id")'
		);
		expectPolicyUses(
			'rating_scheme_entries',
			'INSERT',
			'"public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id")'
		);
		expectPolicyUses(
			'rating_scheme_entries',
			'UPDATE',
			'"public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id")'
		);
		expectPolicyUses(
			'rating_scheme_entries',
			'DELETE',
			'"public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id")'
		);
	});

	it('enforces scoped training-record access for personnel training rows', () => {
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_personnel_training_record"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_personnel_training_record"');
		expectPolicyUses(
			'personnel_trainings',
			'SELECT',
			'"public"."can_view_personnel_training_record"("organization_id", "personnel_id")'
		);
		expectPolicyUses(
			'personnel_trainings',
			'INSERT',
			'"public"."can_edit_personnel_training_record"("organization_id", "personnel_id")'
		);
		expectPolicyUses(
			'personnel_trainings',
			'UPDATE',
			'"public"."can_edit_personnel_training_record"("organization_id", "personnel_id")'
		);
		expectPolicyUses(
			'personnel_trainings',
			'DELETE',
			'"public"."can_edit_personnel_training_record"("organization_id", "personnel_id")'
		);
	});

	it('enforces scoped calendar access for availability entries', () => {
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_availability_record"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_availability_record"');
		expectPolicyUses(
			'availability_entries',
			'SELECT',
			'"public"."can_view_availability_record"("organization_id", "personnel_id")'
		);
		expectPolicyUses(
			'availability_entries',
			'INSERT',
			'"public"."can_edit_availability_record"("organization_id", "personnel_id")'
		);
		expectPolicyUses(
			'availability_entries',
			'UPDATE',
			'"public"."can_edit_availability_record"("organization_id", "personnel_id")'
		);
	});

	it('enforces scoped calendar access for daily assignments through assignee-aware policies', () => {
		const viewPredicate =
			'"public"."can_view_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id")';
		const editPredicate =
			'"public"."can_edit_daily_assignment_record"("organization_id", "assignment_type_id", "assignee_id")';

		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_daily_assignment_record"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_edit_daily_assignment_record"');
		expectPolicyUses('daily_assignments', 'SELECT', viewPredicate);
		expectPolicyUses('daily_assignments', 'INSERT', editPredicate);
		expectPolicyUses('daily_assignments', 'UPDATE', editPredicate);
	});

	it('restricts groups to legitimate viewers and personnel editors', () => {
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_view_groups"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_manage_groups"');
		expectPolicyUses('groups', 'SELECT', '"public"."can_view_groups"("organization_id")');
		expectPolicyUses('groups', null, '"public"."can_manage_groups"("organization_id")');
	});

	it('requires calendar view permission for special-day reads and calendar edit for writes', () => {
		expectPolicyUses('special_days', 'SELECT', '"public"."can_view_calendar"("organization_id")');
		expectPolicyUses('special_days', null, '"public"."can_edit_calendar"("organization_id")');
	});

	it('requires view-specific access for type reads and full-editor access for type writes', () => {
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."is_full_editor_for_org"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_manage_calendar_configuration"');
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_manage_training_configuration"');
		expectPolicyUses('assignment_types', 'SELECT', '"public"."can_view_calendar"("organization_id")');
		expectPolicyUses('assignment_types', null, '"public"."can_manage_calendar_configuration"("organization_id")');
		expectPolicyUses('status_types', 'SELECT', '"public"."can_view_calendar"("organization_id")');
		expectPolicyUses('status_types', null, '"public"."can_manage_calendar_configuration"("organization_id")');
		expectPolicyUses('training_types', 'SELECT', '"public"."can_view_training"("organization_id")');
		expectPolicyUses('training_types', null, '"public"."can_manage_training_configuration"("organization_id")');
	});

	it('requires Critical Tasks view reads for ICT tasks and scoped completion reads', () => {
		expectPolicyUses('ict_tasks', 'SELECT', '"public"."can_view_critical_tasks"("organization_id")');
		expectPolicyUses(
			'personnel_ict_completions',
			'SELECT',
			'"public"."can_view_personnel_ict_completion_record"("organization_id", "personnel_id")'
		);
	});

	it('requires owner/admin task-library writes and scoped Critical Tasks edit completion writes', () => {
		expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."can_manage_ict_task_library"');
		expectPolicyUses('ict_tasks', 'INSERT', '"public"."can_manage_ict_task_library"("organization_id")');
		expectPolicyUses('ict_tasks', 'UPDATE', '"public"."can_manage_ict_task_library"("organization_id")');
		expect(getPolicyBlock('ict_tasks', 'DELETE', '"public"."can_manage_ict_task_library"("organization_id")')).toBe('');
		expectPolicyUses(
			'personnel_ict_completions',
			'INSERT',
			'"public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id")'
		);
		expectPolicyUses(
			'personnel_ict_completions',
			'UPDATE',
			'"public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id")'
		);
		expectPolicyUses(
			'personnel_ict_completions',
			'DELETE',
			'"public"."can_edit_personnel_ict_completion_record"("organization_id", "personnel_id")'
		);
	});

	it('restricts dashboard configs to the owning user', () => {
		expectPolicyUses('dashboard_configs', 'SELECT', 'auth.uid() = user_id');
		expectPolicyUses('dashboard_configs', 'INSERT', 'auth.uid() = user_id');
		expectPolicyUses('dashboard_configs', 'UPDATE', 'auth.uid() = user_id');
	});
});
