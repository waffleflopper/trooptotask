import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationPath = join(process.cwd(), 'supabase/migrations/20260614000100_drop_legacy_clinic_owner_rpc.sql');
const migration = readFileSync(migrationPath, 'utf8');

function normalizedSql() {
	return migration.replace(/\s+/g, ' ').toLowerCase();
}

describe('legacy clinic owner RPC removal migration', () => {
	it('drops the retired clinic owner creation RPC', () => {
		const normalized = normalizedSql();

		expect(normalized).toContain('drop function if exists public.create_clinic_with_owner(text)');
	});

	it('does not recreate or grant client execution for the legacy RPC', () => {
		const normalized = normalizedSql();

		expect(normalized).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\s+public\.create_clinic_with_owner\b/);
		expect(normalized).not.toMatch(
			/\bgrant\s+(execute|all)\s+on\s+function\s+public\.create_clinic_with_owner\(text\)\s+to\s+(anon|authenticated)\b/
		);
	});

	it('does not recreate retired clinic tables', () => {
		const normalized = normalizedSql();

		expect(normalized).not.toMatch(/\bcreate\s+table\s+(if\s+not\s+exists\s+)?("?public"?\.)?"?clinics"?\b/);
		expect(normalized).not.toMatch(/\bcreate\s+table\s+(if\s+not\s+exists\s+)?("?public"?\.)?"?clinic_memberships"?\b/);
	});
});
