import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationFilename = '20260504000600_duty_roster_run_corrections.sql';

function migrationSql(): string {
	return readFileSync(join(process.cwd(), 'supabase', 'migrations', migrationFilename), 'utf8').toLowerCase();
}

describe('Duty Roster Run corrections migration', () => {
	it('creates append-only correction records linked to accepted runs and Personnel Records', () => {
		const normalized = migrationSql().replace(/\s+/g, ' ');

		expect(normalized).toContain('create table if not exists "public"."duty_roster_template_run_corrections"');
		expect(normalized).toContain('"run_row_date" "date" not null');
		expect(normalized).toContain('"original_assignee_id" "uuid" not null');
		expect(normalized).toContain('"replacement_assignee_id" "uuid" not null');
		expect(normalized).toContain('"reason" "text" not null');
		expect(normalized).toContain('"corrected_by_user_id" "uuid"');
		expect(normalized).toContain(
			'foreign key ("run_id") references "public"."duty_roster_template_runs"("id") on delete cascade'
		);
		expect(normalized).toContain(
			'foreign key ("original_assignee_id") references "public"."personnel"("id") on delete restrict'
		);
		expect(normalized).toContain(
			'foreign key ("replacement_assignee_id") references "public"."personnel"("id") on delete restrict'
		);
		expect(normalized).toContain('"duty_roster_template_run_corrections_reason_check"');
	});

	it('keeps correction access on the Calendar permission lane', () => {
		const normalized = migrationSql().replace(/\s+/g, ' ');

		expect(normalized).toContain(
			'alter table "public"."duty_roster_template_run_corrections" enable row level security'
		);
		expect(normalized).toContain('using ("public"."can_view_calendar"("organization_id"))');
		expect(normalized).toContain('with check ("public"."can_edit_calendar"("organization_id"))');
		expect(normalized).toContain('revoke all on table "public"."duty_roster_template_run_corrections" from "anon"');
	});
});
