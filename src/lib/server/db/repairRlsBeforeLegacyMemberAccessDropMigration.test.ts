import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260526000250_repair_rls_before_legacy_member_access_drop.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('repair RLS before legacy member access drop migration', () => {
	it('replaces legacy member-management and group helpers without dropped columns', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."can_manage_org_members"');
		expect(normalized).toContain('"organization_memberships"."role" in (\'owner\', \'admin\')');
		expect(normalized).toContain('create or replace function "public"."can_view_groups"');
		expect(normalized).toContain(
			'"public"."member_access_has_capability"("p_organization_id", \'calendar\', \'view\')'
		);
		expect(normalized).toContain(
			'"public"."member_access_has_capability"("p_organization_id", \'ratingscheme\', \'view\')'
		);
		expect(normalized).not.toContain('"can_manage_members"');
	});

	it('replaces duty roster history policies before calendar flags are dropped', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop policy if exists "org_editors_can_delete_roster_history"');
		expect(normalized).toContain('drop policy if exists "org_editors_can_insert_roster_history"');
		expect(normalized).toContain('using ("public"."can_edit_calendar"("organization_id"))');
		expect(normalized).toContain('with check ("public"."can_edit_calendar"("organization_id"))');
		expect(normalized).not.toContain('"can_edit_calendar" = true');
	});

	it('replaces sign-in roster policies before training flags are dropped', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop policy if exists "sign_in_rosters_delete"');
		expect(normalized).toContain('drop policy if exists "sign_in_rosters_select"');
		expect(normalized).toContain('drop policy if exists "sign_in_rosters_update"');
		expect(normalized).toContain('using ("public"."can_edit_training"("organization_id"))');
		expect(normalized).toContain('using ("public"."can_view_training"("organization_id"))');
		expect(normalized).not.toContain('"can_edit_training" = true');
		expect(normalized).not.toContain('"can_view_training" = true');
	});
});
