import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260522000500_organization_invitation_membership_role_snapshot.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('organization invitation membership role snapshot migration', () => {
	it('adds an explicit membership role column to organization invitations', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain("table_name = 'organization_invitations'");
		expect(normalized).toContain("column_name = 'role'");
		expect(normalized).toContain('alter table "public"."organization_invitations"');
		expect(normalized).toContain('add column "role" "public"."organization_role"');
		expect(normalized).toContain('default \'member\'::"public"."organization_role" not null');
	});

	it('backfills legacy full-governance invitations as admin snapshots', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('update "public"."organization_invitations" set "role" = \'admin\'');
		expect(normalized).toContain('"can_manage_members" is true');
		expect(normalized).toContain('coalesce("can_view_rating_scheme", "can_view_personnel") is true');
		expect(normalized).toContain('coalesce("can_edit_rating_scheme", "can_edit_personnel") is true');
	});
});
