import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationFilename = '20260504000400_duty_roster_calendar_application.sql';

function migrationSql(): string {
	return readFileSync(join(process.cwd(), 'supabase', 'migrations', migrationFilename), 'utf8').toLowerCase();
}

describe('Duty Roster Calendar application migration', () => {
	it('links Duty Roster Templates to real Calendar assignment types', () => {
		const normalized = migrationSql().replace(/\s+/g, ' ');

		expect(normalized).toContain('add column if not exists "assignment_type_id" "uuid"');
		expect(normalized).toContain('insert into "public"."assignment_types"');
		expect(normalized).toContain('\'#8a5a22\', 0, false, array[]::"text"[]');
		expect(normalized).toContain(
			'foreign key ("assignment_type_id") references "public"."assignment_types"("id") on delete cascade'
		);
	});

	it('adds run application state and assignment lineage columns', () => {
		const normalized = migrationSql().replace(/\s+/g, ' ');

		expect(normalized).toContain('add column if not exists "applied_at" timestamp with time zone');
		expect(normalized).toContain('add column if not exists "duty_roster_template_run_id" "uuid"');
		expect(normalized).toContain('add column if not exists "duty_roster_template_run_row_date" "date"');
		expect(normalized).toContain(
			'foreign key ("duty_roster_template_run_id") references "public"."duty_roster_template_runs"("id") on delete set null'
		);
	});
});
