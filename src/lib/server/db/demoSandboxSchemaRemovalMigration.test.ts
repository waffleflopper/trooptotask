import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationFilename = '20260514000100_remove_demo_sandbox_schema.sql';
const migrationPath = join(process.cwd(), 'supabase/migrations', migrationFilename);
const sql = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return sql.replace(/\s+/g, ' ').toLowerCase();
}

describe('demo/sandbox schema removal migration', () => {
	it('drops the deprecated sandbox RPCs before removing organization columns', () => {
		const normalized = normalizedSql();

		const createRpcDrop = normalized.indexOf('drop function if exists "public"."create_demo_sandbox"(text)');
		const cleanupRpcDrop = normalized.indexOf('drop function if exists "public"."cleanup_expired_demo_sandboxes"()');
		const columnDrop = normalized.indexOf('drop column if exists "demo_type"');

		expect(createRpcDrop).toBeGreaterThan(-1);
		expect(cleanupRpcDrop).toBeGreaterThan(-1);
		expect(columnDrop).toBeGreaterThan(-1);
		expect(createRpcDrop).toBeLessThan(columnDrop);
		expect(cleanupRpcDrop).toBeLessThan(columnDrop);
	});

	it('removes the demo organization columns and related index/constraint', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop index if exists "public"."idx_organizations_demo_expires"');
		expect(normalized).toContain('drop constraint if exists "organizations_demo_type_check"');
		expect(normalized).toContain('drop column if exists "demo_type"');
		expect(normalized).toContain('drop column if exists "demo_expires_at"');
	});
});
