import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260503000200_advanced_duty_revision_storage.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('Advanced Duty revision storage migration', () => {
	it('runs after the snapshot lineage replacement migration', () => {
		expect(migrationFilename).toMatch(/^20260503000200_/);
	});

	it('creates draft, change-set, and slot-change storage tables', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create table if not exists "public"."advanced_duty_revision_drafts"');
		expect(normalized).toContain('create table if not exists "public"."advanced_duty_revision_change_sets"');
		expect(normalized).toContain('create table if not exists "public"."advanced_duty_revision_slot_changes"');
		expect(normalized).toContain('"applied_run_id" "uuid" not null');
		expect(normalized).toContain('"source_snapshot_id" "uuid"');
		expect(normalized).toContain('"source_snapshot_fingerprint" "text"');
		expect(normalized).toContain('"slot_changes" "jsonb" default \'[]\'::"jsonb" not null');
		expect(normalized).toContain('"draft_version" integer default 1 not null');
		expect(normalized).toContain('"reason" "text" not null');
		expect(normalized).toContain('"change_intent" "text" not null');
	});

	it('enforces compact lifecycle constraints and one active draft per applied run', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain(
			'create unique index if not exists "advanced_duty_revision_drafts_one_active_run_idx" on "public"."advanced_duty_revision_drafts" using "btree" ("organization_id", "applied_run_id") where ("status" = \'draft\'::"text")'
		);
		expect(normalized).toContain(
			'constraint "advanced_duty_revision_drafts_slot_changes_array_check" check (("jsonb_typeof"("slot_changes") = \'array\'::"text"))'
		);
		expect(normalized).toContain(
			'constraint "advanced_duty_revision_drafts_validation_metadata_object_check" check ((("latest_validation" is null) or ("jsonb_typeof"("latest_validation") = \'object\'::"text")))'
		);
		expect(normalized).toContain(
			'constraint "advanced_duty_revision_change_sets_conflict_summary_object_check" check ((("conflict_summary" is null) or ("jsonb_typeof"("conflict_summary") = \'object\'::"text")))'
		);
		expect(normalized).toContain(
			'constraint "advanced_duty_revision_slot_changes_personnel_snapshots_object_check" check'
		);
		expect(normalized).not.toContain('"snapshot_payload"');
		expect(normalized).not.toContain('"preview_payload"');
	});

	it('uses the approved access split for draft workflow and compact history', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('alter table "public"."advanced_duty_revision_drafts" enable row level security');
		expect(normalized).toContain('create policy "advanced duty actors can manage revision drafts"');
		expect(normalized).toContain('"advanced_duty_revision_actor_can_manage"("organization_id")');
		expect(normalized).toContain('create policy "calendar viewers can read advanced duty revision history"');
		expect(normalized).toContain('"public"."can_view_calendar"("organization_id")');
		expect(normalized).toContain('create policy "advanced duty actors can write advanced duty revision history"');
		expect(normalized).not.toContain('can_view_calendar"("organization_id") with check');
	});

	it('adds an atomic revision reapply RPC for operational writes and history', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create or replace function "public"."apply_advanced_duty_revision"');
		expect(normalized).toContain('update "public"."duty_event_slots"');
		expect(normalized).toContain('update "public"."duty_events"');
		expect(normalized).toContain('insert into "public"."advanced_duty_revision_change_sets"');
		expect(normalized).toContain('insert into "public"."advanced_duty_revision_slot_changes"');
		expect(normalized).toContain('update "public"."advanced_duty_revision_drafts"');
		expect(normalized).toContain('grant all on function "public"."apply_advanced_duty_revision"');
	});
});
