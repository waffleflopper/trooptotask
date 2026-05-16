import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260515000400_personnel_follow_ups.sql');
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('personnel follow-ups migration', () => {
	it('scopes RLS policies through the followed Soldier group', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create table if not exists "public"."personnel_follow_ups"');
		expect(normalized).toContain('from "public"."personnel"');
		expect(normalized).toContain('"personnel"."id" = "personnel_follow_ups"."personnel_id"');
		expect(normalized).toContain('"personnel"."organization_id" = "personnel_follow_ups"."organization_id"');
		expect(normalized).toContain(
			'"public"."member_access_group_scope_matches"("personnel_follow_ups"."organization_id", "personnel"."group_id")'
		);
	});
});
