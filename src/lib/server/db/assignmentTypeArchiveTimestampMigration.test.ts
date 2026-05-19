import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260518000400_assignment_type_archive_timestamp.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('assignment type archive timestamp migration', () => {
	it('adds soft-archive storage and an active lookup index for Calendar assignment types', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'alter table "public"."assignment_types" add column if not exists "archived_at" timestamp with time zone'
		);
		expect(normalized).toContain(
			'create index if not exists "idx_assignment_types_org_archived_sort" on "public"."assignment_types" using "btree" ("organization_id", "archived_at", "sort_order")'
		);
	});
});
