import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260504000100_duty_roster_templates.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Duty Roster Templates migration', () => {
	it('creates one-duty template identity storage', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create table if not exists "public"."duty_roster_templates"');
		expect(normalized).toContain('"id" "uuid" default "gen_random_uuid"() not null');
		expect(normalized).toContain('"name" "text" not null');
		expect(normalized).toContain('"slug" "text" not null');
		expect(normalized).toContain('"short_code" "text"');
		expect(normalized).toContain('"created_by_user_id" "uuid"');
	});

	it('keeps template slugs unique only inside an Organization', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'create unique index if not exists "duty_roster_templates_org_slug_key" on "public"."duty_roster_templates" using "btree" ("organization_id", "slug")'
		);
		expect(normalized).not.toContain('unique ("slug")');
	});

	it('uses Calendar RLS for scoped Duty Roster access', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."duty_roster_templates" enable row level security');
		expect(normalized).toContain('using ("public"."can_view_calendar"("organization_id"))');
		expect(normalized).toContain('using ("public"."can_edit_calendar"("organization_id"))');
		expect(normalized).toContain('with check ("public"."can_edit_calendar"("organization_id"))');
	});
});
