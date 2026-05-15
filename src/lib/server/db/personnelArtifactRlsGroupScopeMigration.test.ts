import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260515000900_personnel_artifact_rls_group_scope.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('personnel artifact RLS group-scope migration', () => {
	it('scopes leader note policies through the linked Soldier group', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop policy if exists "users can view leader notes if can view personnel"');
		expect(normalized).toContain('"public"."member_access_has_capability"("organization_id", \'personnel\', \'view\')');
		expect(normalized).toContain('"personnel"."id" = "leader_notes"."personnel_id"');
		expect(normalized).toContain('"personnel"."organization_id" = "leader_notes"."organization_id"');
		expect(normalized).toContain(
			'"public"."member_access_group_scope_matches"("leader_notes"."organization_id", "personnel"."group_id")'
		);
	});

	it('scopes personnel document policies through the linked Soldier group', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop policy if exists "members can view personnel documents"');
		expect(normalized).toContain('"personnel"."id" = "personnel_documents"."personnel_id"');
		expect(normalized).toContain('"personnel"."organization_id" = "personnel_documents"."organization_id"');
		expect(normalized).toContain(
			'"public"."member_access_group_scope_matches"("personnel_documents"."organization_id", "personnel"."group_id")'
		);
	});

	it('scopes personnel document storage policies through the path Soldier group', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop policy if exists "members can view personnel document files"');
		expect(normalized).toContain('("bucket_id" = \'personnel-documents\')');
		expect(normalized).toContain('((storage.foldername("name"))[2] = \'personnel\')');
		expect(normalized).toContain('((storage.foldername("name"))[4] = \'documents\')');
		expect(normalized).toContain('"personnel"."id" = ((storage.foldername("name"))[3])::uuid');
		expect(normalized).toContain(
			'"public"."member_access_group_scope_matches"(((storage.foldername("name"))[1])::uuid, "personnel"."group_id")'
		);
	});
});
