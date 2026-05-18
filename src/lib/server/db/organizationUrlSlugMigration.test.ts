import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260518000300_organization_url_slug.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Organization URL Slug migration', () => {
	it('adds optional organization URL slug storage', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."organizations" add column if not exists "url_slug" "text"');
	});

	it('keeps organization URL slugs globally unique when present', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'create unique index if not exists "organizations_url_slug_key" on "public"."organizations" using "btree" ("url_slug") where "url_slug" is not null'
		);
	});

	it('stores only lowercase URL-safe slugs in the database', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('"url_slug" = lower("url_slug")');
		expect(normalized).toContain(`"url_slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`);
		expect(normalized).toContain('char_length("url_slug") between 3 and 48');
	});
});
