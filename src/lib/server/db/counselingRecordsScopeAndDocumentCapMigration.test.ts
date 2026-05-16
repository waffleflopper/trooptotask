import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
	process.cwd(),
	'supabase/migrations/20260515001200_counseling_records_scope_and_document_cap.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('counseling records scope and document cap migration', () => {
	it('scopes counseling record policies through the linked Soldier group', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop policy if exists "users can view counseling records if can view personnel"');
		expect(normalized).toContain('"personnel"."id" = "counseling_records"."personnel_id"');
		expect(normalized).toContain('"personnel"."organization_id" = "counseling_records"."organization_id"');
		expect(normalized).toContain(
			'"public"."member_access_group_scope_matches"("counseling_records"."organization_id", "personnel"."group_id")'
		);
	});

	it('scopes counseling file storage access through the path Soldier group', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain("when 'counseling-records' then");
		expect(normalized).toContain('personnel_id := (storage.foldername(object_name))[3]::uuid');
		expect(normalized).toContain('"personnel"."id" = personnel_id');
		expect(normalized).toContain('"public"."member_access_group_scope_matches"(org_id, "personnel"."group_id")');
	});

	it('excludes archived personnel documents from the database storage cap', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."enforce_personnel_document_storage_cap"');
		expect(normalized).toContain('"archived_at" is null');
	});
});
