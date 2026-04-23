import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260423000100_rating_scheme_permission_lane.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Rating Scheme permission-lane migration', () => {
	it('uses the next ordered timestamp after the critical-tasks lane slice', () => {
		expect(migrationFilename).toMatch(/^20260423000100_/);
	});

	it('adds and backfills dedicated rating-scheme permission columns', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'alter table "public"."organization_memberships" add column if not exists "can_view_rating_scheme" boolean'
		);
		expect(normalized).toContain('add column if not exists "can_edit_rating_scheme" boolean');
		expect(normalized).toContain(
			'alter table "public"."organization_invitations" add column if not exists "can_view_rating_scheme" boolean'
		);
		expect(normalized).toContain('coalesce("can_view_rating_scheme", "can_view_personnel", false)');
		expect(normalized).toContain(
			'coalesce("can_edit_rating_scheme", ("can_edit_personnel" and "can_edit_leaders_book"), false)'
		);
		expect(normalized).toContain('alter column "can_view_rating_scheme" set not null');
		expect(normalized).toContain('alter column "can_edit_rating_scheme" set not null');
	});

	it('switches rating-scheme RLS helpers and scoped reference reads onto the dedicated lane', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."can_view_rating_scheme"');
		expect(normalized).toContain('create or replace function "public"."can_edit_rating_scheme"');
		expect(normalized).toContain('create or replace function "public"."can_view_rating_scheme_record"');
		expect(normalized).toContain('create or replace function "public"."can_edit_rating_scheme_record"');
		expect(normalized).toContain('create or replace function "public"."list_rating_scheme_personnel_lookup"');
		expect(normalized).toContain('returns table("id" "uuid", "rank" "text", "last_name" "text", "first_name" "text")');
		expect(normalized.match(/set "search_path" to ''/g)).toHaveLength(5);
		expect(normalized).toContain('"organization_memberships"."can_view_rating_scheme" = true');
		expect(normalized).toContain('"organization_memberships"."can_edit_rating_scheme" = true');
		expect(normalized).toContain('revoke all on function "public"."list_rating_scheme_personnel_lookup"');
		expect(normalized).toContain(
			'grant execute on function "public"."list_rating_scheme_personnel_lookup"("p_organization_id" "uuid") to "authenticated"'
		);
		expect(normalized).toContain(
			'drop policy if exists "org editors can manage rating scheme" on "public"."rating_scheme_entries"'
		);
		expect(normalized).toContain(
			'create policy "users can view rating scheme entries if allowed by scoped rating scheme access"'
		);
		expect(normalized).toContain('"public"."can_view_rating_scheme_record"("organization_id", "rated_person_id")');
		expect(normalized).toContain('"public"."can_edit_rating_scheme_record"("organization_id", "rated_person_id")');
		expect(normalized).not.toContain(
			'create policy "users can view personnel if allowed by scoped rating scheme reference access"'
		);
		expect(normalized).not.toContain('create or replace function "public"."can_view_rating_scheme_personnel_record"');
		expect(normalized).not.toContain(
			'"public"."can_view_rating_scheme_personnel_record"("organization_id", "group_id")'
		);
		expect(normalized).not.toContain('"public"."can_view_personnel"("organization_id")');
		expect(normalized).not.toContain('"public"."can_edit_personnel"("organization_id")');
	});
});
