import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260526000100_normalize_member_access_replacement_storage.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('member access replacement normalization migration', () => {
	it('runs as a new release-safe migration after existing member-access storage migrations', () => {
		expect(migrationFilename).toMatch(/^20260526/);
		expect(normalizedSql()).toContain('update "public"."organization_memberships"');
		expect(normalizedSql()).toContain('update "public"."organization_invitations"');
	});

	it('preserves owner and admin governance roles while re-deriving replacement member access from current flags', () => {
		const normalized = normalizedSql();

		expect(normalized).not.toContain('"role" =');
		expect(normalized).not.toContain('"can_manage_members" =');
		expect(normalized).toContain('"member_preset" = case');
		expect(normalized).toContain('"capability_overrides" = case');
		expect(normalized).toContain('else jsonb_strip_nulls');
	});

	it('keeps replacement-native operator and multi-group access because legacy flags cannot represent operate capability', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'when "scoped_group_id" is null and ("member_preset" = \'operator\' or array_length("access_scope_group_ids", 1) > 0) then "member_preset"'
		);
		expect(normalized).toContain('when "scoped_group_id" is not null then "capability_overrides"');
		expect(normalized).toContain(
			'when "member_preset" = \'operator\' or array_length("access_scope_group_ids", 1) > 0 then "capability_overrides"'
		);
	});

	it('covers viewer, operator, editor, and explicit override normalization from legacy flags', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('when "scoped_group_id" is not null then \'operator\'');
		expect(normalized).toContain("then 'editor'");
		expect(normalized).toContain("then 'viewer'");
		expect(normalized).toContain("jsonb_strip_nulls(jsonb_build_object( 'calendar'");
		expect(normalized).toContain('public"."member_access_capability_override"');
		expect(normalized).toContain('when "scoped_group_id" is not null then \'operate\'');
		expect(normalized).toContain("then 'configure' else 'view' end");
	});

	it('preserves existing multi-group scope sets and only falls back to old single-group scope when replacement scope is missing', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('when array_length("access_scope_group_ids", 1) > 0 then \'groups\'');
		expect(normalized).toContain("else 'organization' end");
		expect(normalized).toContain('"access_scope_group_ids" = case');
		expect(normalized).toContain('when array_length("access_scope_group_ids", 1) > 0 then "access_scope_group_ids"');
		expect(normalized).toContain('when "scoped_group_id" is not null then array["scoped_group_id"]');
	});
});
