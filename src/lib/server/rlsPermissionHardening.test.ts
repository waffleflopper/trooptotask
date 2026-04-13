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
	const actionPattern = action ? ` FOR ${action}` : '(?: FOR [A-Z]+)?';
	const match = sql.match(
		new RegExp(
			`CREATE POLICY "[^"]+" ON "public"\\."${table}"${actionPattern}[\\s\\S]*?${escapeRegex(expectedPredicate)}[\\s\\S]*?;`
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
});
