import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationFilename = '20260504000500_duty_roster_run_invalidation.sql';

function migrationSql(): string {
	return readFileSync(join(process.cwd(), 'supabase', 'migrations', migrationFilename), 'utf8').toLowerCase();
}

describe('Duty Roster Run invalidation migration', () => {
	it('adds invalidation custody columns and allows invalidated run status', () => {
		const normalized = migrationSql().replace(/\s+/g, ' ');

		expect(normalized).toContain('add column if not exists "invalidated_at" timestamp with time zone');
		expect(normalized).toContain('add column if not exists "invalidated_by_user_id" "uuid"');
		expect(normalized).toContain('array[\'accepted\'::"text", \'invalidated\'::"text"]');
		expect(normalized).toContain(
			'foreign key ("invalidated_by_user_id") references "auth"."users"("id") on delete set null'
		);
	});

	it('adds an update policy for service-layer invalidation writes', () => {
		const normalized = migrationSql().replace(/\s+/g, ' ');

		expect(normalized).toContain('for update using ("public"."can_edit_calendar"("organization_id"))');
		expect(normalized).toContain('with check ("public"."can_edit_calendar"("organization_id"))');
	});
});
