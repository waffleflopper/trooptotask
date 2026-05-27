import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260526000300_drop_legacy_member_access_columns.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('drop legacy member access columns migration', () => {
	const legacyColumns = [
		'can_view_calendar',
		'can_edit_calendar',
		'can_view_personnel',
		'can_edit_personnel',
		'can_view_training',
		'can_edit_training',
		'can_view_critical_tasks',
		'can_edit_critical_tasks',
		'can_view_onboarding',
		'can_edit_onboarding',
		'can_view_rating_scheme',
		'can_edit_rating_scheme',
		'can_manage_members',
		'scoped_group_id'
	];

	it('drops legacy permission flags and single-Group scope from memberships', () => {
		const normalized = normalizedSql();
		const membershipBlock = normalized.slice(
			normalized.indexOf('alter table "public"."organization_memberships"'),
			normalized.indexOf('alter table "public"."organization_invitations"')
		);

		for (const column of legacyColumns) {
			expect(membershipBlock).toContain(`drop column if exists "${column}"`);
		}
	});

	it('drops legacy permission flags and single-Group scope from invitations', () => {
		const normalized = normalizedSql();
		const invitationBlock = normalized.slice(normalized.indexOf('alter table "public"."organization_invitations"'));

		for (const column of legacyColumns) {
			expect(invitationBlock).toContain(`drop column if exists "${column}"`);
		}
	});

	it('does not drop replacement member-access storage', () => {
		const normalized = normalizedSql();

		expect(normalized).not.toContain('"member_preset"');
		expect(normalized).not.toContain('"capability_overrides"');
		expect(normalized).not.toContain('"access_scope_kind"');
		expect(normalized).not.toContain('"access_scope_group_ids"');
	});
});
