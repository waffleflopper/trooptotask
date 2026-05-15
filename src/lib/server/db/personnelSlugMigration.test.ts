import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260514000200_personnel_slug.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Personnel Slug migration', () => {
	it('adds required slug storage to personnel records', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."personnel" add column if not exists "slug" "text"');
		expect(normalized).toContain('alter table "public"."personnel" alter column "slug" set not null');
	});

	it('backfills existing Personnel Records from last name and first name with collision suffixes', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('row_number() over (partition by "organization_id", "base_slug"');
		expect(normalized).toContain(`when "ranked"."ordinal" = 1 then "ranked"."base_slug"`);
		expect(normalized).toContain(`else "ranked"."base_slug" || '-' || "ranked"."ordinal"::"text"`);
	});

	it('keeps Personnel Slugs unique only inside an Organization', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'create unique index if not exists "personnel_org_slug_key" on "public"."personnel" using "btree" ("organization_id", "slug")'
		);
		expect(normalized).not.toContain('unique ("slug")');
	});
});
