import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationFilename = '20260504000300_duty_roster_template_runs.sql';

function migrationSql(): string {
	return readFileSync(join(process.cwd(), 'supabase', 'migrations', migrationFilename), 'utf8').toLowerCase();
}

describe('Duty Roster Template accepted runs migration', () => {
	it('creates an accepted run snapshot table linked to templates', () => {
		const normalized = migrationSql().replace(/\s+/g, ' ');

		expect(normalized).toContain('create table if not exists "public"."duty_roster_template_runs"');
		expect(normalized).toContain('"template_id" "uuid" not null');
		expect(normalized).toContain('"snapshot_payload" "jsonb" default \'{}\'::"jsonb" not null');
		expect(normalized).toContain(
			'foreign key ("template_id") references "public"."duty_roster_templates"("id") on delete cascade'
		);
		expect(normalized).toContain('"duty_roster_template_runs_snapshot_payload_object_check"');
	});

	it('keeps run access on the Calendar permission lane', () => {
		const normalized = migrationSql().replace(/\s+/g, ' ');

		expect(normalized).toContain('alter table "public"."duty_roster_template_runs" enable row level security');
		expect(normalized).toContain('using ("public"."can_view_calendar"("organization_id"))');
		expect(normalized).toContain('with check ("public"."can_edit_calendar"("organization_id"))');
		expect(normalized).toContain('revoke all on table "public"."duty_roster_template_runs" from "anon"');
	});
});
