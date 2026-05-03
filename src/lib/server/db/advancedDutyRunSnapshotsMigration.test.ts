import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260428000200_advanced_duty_run_snapshots.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Advanced Duty Run snapshot migration', () => {
	it('runs after the DA6 status-treatment migration', () => {
		expect(migrationFilename).toMatch(/^20260428000200_/);
	});

	it('creates the draft snapshot table with custody and lifecycle fields', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create table if not exists "public"."advanced_duty_run_snapshots"');
		expect(normalized).toContain('"snapshot_fingerprint" "text" not null');
		expect(normalized).toContain('"snapshot_version" integer default 1 not null');
		expect(normalized).toContain('"draft_lineage_key" "text" not null');
		expect(normalized).toContain('"status" "text" default \'draft\'::"text" not null');
		expect(normalized).toContain(
			'"expires_at" timestamp with time zone default ("now"() + \'24:00:00\'::interval) not null'
		);
		expect(normalized).toContain('"input_payload" "jsonb" default \'{}\'::"jsonb" not null');
		expect(normalized).toContain('"snapshot_payload" "jsonb" default \'{}\'::"jsonb" not null');
		expect(normalized).toContain('"preview_payload" "jsonb" default \'{}\'::"jsonb" not null');
		expect(normalized).toContain('"export_model" "jsonb"');
		expect(normalized).toContain('"applied_run_id" "uuid"');
	});

	it('keeps draft snapshot access admin-only through RLS', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."advanced_duty_run_snapshots" enable row level security');
		expect(normalized).toContain('create policy "org admins can manage advanced duty run snapshots"');
		expect(normalized).toContain(
			'"organization_memberships"."role" = any (array[\'owner\'::"public"."organization_role", \'admin\'::"public"."organization_role"])'
		);
		expect(normalized).not.toContain('can_view_calendar');
		expect(normalized).toContain('revoke all on table "public"."advanced_duty_run_snapshots" from "anon"');
	});

	it('supports lifecycle recovery with updated_at maintenance and applying lookup index', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'create or replace trigger "advanced_duty_run_snapshots_updated_at" before update on "public"."advanced_duty_run_snapshots"'
		);
		expect(normalized).toContain('execute function "public"."update_updated_at_column"()');
		expect(normalized).toContain(
			'create index "advanced_duty_run_snapshots_applying_recovery_idx" on "public"."advanced_duty_run_snapshots" using "btree" ("organization_id", "updated_at") where ("status" = \'applying\'::"text")'
		);
	});

	it('enforces one current draft per lineage through the replacement RPC', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'create unique index "advanced_duty_run_snapshots_current_draft_lineage_key" on "public"."advanced_duty_run_snapshots" using "btree" ("organization_id", "draft_lineage_key") where ("status" = \'draft\'::"text")'
		);
		expect(normalized).toContain('create or replace function "public"."replace_advanced_duty_run_snapshot"');
		expect(normalized).toContain('pg_advisory_xact_lock');
		expect(normalized).toContain('"draft_lineage_key" = "p_draft_lineage_key"');
		expect(normalized).not.toContain('limit 100');
	});
});
