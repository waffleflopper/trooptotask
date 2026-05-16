import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const leaderNotesMigrationPath = join(process.cwd(), 'supabase/migrations/20260515000100_create_leader_notes.sql');
const retirementMigrationPath = join(process.cwd(), 'supabase/migrations/20260515000500_retire_leaders_book.sql');

const leaderNotesSql = readFileSync(leaderNotesMigrationPath, 'utf8');
const retirementSql = readFileSync(retirementMigrationPath, 'utf8');

function normalize(sql: string) {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Leaders Book retirement migration', () => {
	it('makes legacy leader-note migration failure-obvious before dropping the source column', () => {
		const normalized = normalize(leaderNotesSql);
		const validationIndex = normalized.indexOf('leader note migration incomplete');
		const dropIndex = normalized.indexOf('drop column if exists "leader_notes"');

		expect(validationIndex).toBeGreaterThan(-1);
		expect(dropIndex).toBeGreaterThan(validationIndex);
		expect(normalized).toContain('select count(*) into "source_count"');
		expect(normalized).toContain('select count(*) into "migrated_count"');
	});

	it('migrates development goals into Personnel follow-ups before dropping the table', () => {
		const normalized = normalize(retirementSql);
		const insertIndex = normalized.indexOf('insert into "public"."personnel_follow_ups"');
		const dropIndex = normalized.indexOf('drop table if exists "public"."development_goals"');

		expect(insertIndex).toBeGreaterThan(-1);
		expect(dropIndex).toBeGreaterThan(insertIndex);
		expect(normalized).toContain('from "public"."development_goals"');
		expect(normalized).toContain("'migrated development goal'");
		expect(normalized).toContain("case when \"status\" = 'completed' then 'completed' else 'open' end");
	});

	it('denormalizes counseling type names onto counseling records before dropping type management', () => {
		const normalized = normalize(retirementSql);
		const updateIndex = normalized.indexOf('update "public"."counseling_records" as "records"');
		const dropIndex = normalized.indexOf('drop table if exists "public"."counseling_types"');

		expect(updateIndex).toBeGreaterThan(-1);
		expect(dropIndex).toBeGreaterThan(updateIndex);
		expect(normalized).toContain('\'legacy counseling type: \' || "types"."name"');
		expect(normalized).toContain('"records"."counseling_type_id" = "types"."id"');
	});
});
