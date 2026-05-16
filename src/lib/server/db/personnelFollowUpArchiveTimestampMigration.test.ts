import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
	process.cwd(),
	'supabase/migrations/20260515001400_personnel_follow_up_archive_timestamp.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('personnel follow-up archive timestamp migration', () => {
	it('adds archived timestamp storage and lookup index for already-created follow-up tables', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'alter table "public"."personnel_follow_ups" add column if not exists "archived_at" timestamp with time zone'
		);
		expect(normalized).toContain(
			'create index if not exists "idx_personnel_follow_ups_personnel_status_archived" on "public"."personnel_follow_ups" using "btree" ("personnel_id", "status", "archived_at" desc)'
		);
	});
});
