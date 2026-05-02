import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260502000100_remove_legacy_authorization_from_rls_helpers.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('legacy authorization removal from RLS helpers migration', () => {
	it('replaces active database helper authorization with member preset, capability override, and Scope Set storage', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."member_access_required_capability_rank"');
		expect(normalized).toContain('create or replace function "public"."member_access_lane_capability"');
		expect(normalized).toContain('create or replace function "public"."member_access_has_capability"');
		expect(normalized).toContain('"organization_memberships"."member_preset"');
		expect(normalized).toContain('"organization_memberships"."capability_overrides"');
		expect(normalized).toContain('"organization_memberships"."access_scope_kind"');
		expect(normalized).toContain('"organization_memberships"."access_scope_group_ids"');
		expect(normalized).toContain('"p_group_id" = any("organization_memberships"."access_scope_group_ids")');
	});

	it('keeps legacy columns out of active helper bodies after the transition helpers are defined', () => {
		const normalized = normalizedSql();
		const activeHelperStart = normalized.indexOf('create or replace function "public"."can_view_calendar"');

		expect(activeHelperStart).toBeGreaterThan(-1);
		const activeHelperSql = normalized.slice(activeHelperStart);

		expect(activeHelperSql).not.toContain('"organization_memberships"."can_view_');
		expect(activeHelperSql).not.toContain('"organization_memberships"."can_edit_');
		expect(activeHelperSql).not.toContain('"organization_memberships"."scoped_group_id"');
		expect(activeHelperSql).not.toContain('"public"."is_full_editor_for_org"');
	});

	it('pins search_path on SQL security definer helpers', () => {
		const normalized = normalizedSql();

		expect(normalized).not.toContain('language "sql" stable security definer as $$');
	});

	it('covers viewer, operator, editor, owner/admin, multi-Group scope, and out-of-scope database behavior', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('"p_member_preset" = \'viewer\'');
		expect(normalized).toContain('"p_member_preset" = \'operator\'');
		expect(normalized).toContain('"p_member_preset" = \'editor\'');
		expect(normalized).toContain('"organization_memberships"."role" in (\'owner\', \'admin\')');
		expect(normalized).toContain("'operate'");
		expect(normalized).toContain("'configure'");
		expect(normalized).toContain('array_length("organization_memberships"."access_scope_group_ids", 1)');
		expect(normalized).toContain('"p_group_id" = any("organization_memberships"."access_scope_group_ids")');
	});
});
