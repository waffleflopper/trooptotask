import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260501000100_member_access_storage.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('member access storage migration', () => {
	it('adds platform preset, capability override, and shared scope-set storage to memberships and invitations', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."organization_memberships"');
		expect(normalized).toContain('add column if not exists "member_preset" text');
		expect(normalized).toContain('add column if not exists "capability_overrides" jsonb');
		expect(normalized).toContain('add column if not exists "access_scope_kind" text');
		expect(normalized).toContain('add column if not exists "access_scope_group_ids" uuid[]');
		expect(normalized).toContain('add column if not exists "access_scope_personnel_ids" uuid[]');
		expect(normalized).toContain('alter table "public"."organization_invitations"');
	});

	it('backfills current permission flags as temporary compatibility scaffolding instead of the destination model', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('backfill current boolean permission flags into transitional member-access storage');
		expect(normalized).toContain('"member_preset" = case');
		expect(normalized).toContain('when "scoped_group_id" is not null then \'operator\'');
		expect(normalized).toContain("jsonb_build_object('calendar'");
		expect(normalized).toContain('"access_scope_group_ids" = case');
		expect(normalized).toContain('array["scoped_group_id"]');
	});

	it('prepares RLS helpers for multi-group scope checks without introducing per-feature scope matrices', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."member_access_group_scope_matches"');
		expect(normalized).toContain('"p_group_id" = any("organization_memberships"."access_scope_group_ids")');
		expect(normalized).toContain('"organization_memberships"."access_scope_kind" = \'organization\'');
		expect(normalized).not.toContain('calendar_scope_group_ids');
		expect(normalized).not.toContain('personnel_scope_group_ids');
	});
});
