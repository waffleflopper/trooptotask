import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260515001000_personnel_artifact_org_indexes.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('personnel artifact indexes migration', () => {
	it('adds Organization-scoped indexes for Personnel artifact tables', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'create index if not exists "idx_personnel_follow_ups_org" on "public"."personnel_follow_ups" using "btree" ("organization_id")'
		);
		expect(normalized).toContain(
			'create index if not exists "idx_personnel_documents_org" on "public"."personnel_documents" using "btree" ("organization_id")'
		);
	});
});
