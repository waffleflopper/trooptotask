import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(
	process.cwd(),
	'supabase/migrations/20260613000300_platform_audit_global_timestamp_index.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('platform audit timestamp index migration', () => {
	it('adds the global descending timestamp index for platform audit reads', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('create index if not exists "idx_audit_logs_timestamp_desc"');
		expect(normalized).toContain('on "public"."audit_logs" using "btree" ("timestamp" desc)');
	});

	it('does not drop or replace existing audit indexes', () => {
		const normalized = normalizedSql();

		expect(normalized).not.toMatch(/\bdrop\s+index\b/);
		expect(normalized).not.toMatch(/\balter\s+index\b/);
		expect(normalized).not.toContain('"idx_audit_logs_action"');
		expect(normalized).not.toContain('"idx_audit_logs_org_id_timestamp"');
		expect(normalized).not.toContain('"idx_audit_logs_severity"');
		expect(normalized).not.toContain('"idx_audit_logs_user_id"');
	});

	it('does not alter audit_logs RLS or table columns', () => {
		const normalized = normalizedSql();

		expect(normalized).not.toMatch(/\balter\s+table\s+(only\s+)?("?public"?\.)?"?audit_logs"?/);
		expect(normalized).not.toMatch(/\b(create|alter|drop)\s+policy\b/);
		expect(normalized).not.toMatch(/\b(enable|disable)\s+row\s+level\s+security\b/);
		expect(normalized).not.toMatch(/\b(add|drop|alter)\s+column\b/);
	});
});
