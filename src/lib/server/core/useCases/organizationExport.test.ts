import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';
import { ORGANIZATION_EXPORT_SECTIONS } from './organizationExport';

const ORGANIZATION_EXPORT_EXCLUDED_TABLES = [
	'access_requests',
	'account_setup_links',
	'announcement_dismissals',
	'counseling_types',
	'development_goals',
	'platform_admins',
	'platform_announcements',
	'registration_invites',
	'stripe_webhook_events',
	'user_profiles',
	'user_suspensions'
] as const;

describe('organization export inventory', () => {
	it('accounts for every organization-owned table declared in migrations', () => {
		const migrationPaths = globSync('supabase/migrations/*.sql', { cwd: process.cwd() });
		const orgOwnedTables = new Set<string>();
		const createTablePattern =
			/create table(?: if not exists)? (?:"public"\."([^"]+)"|public\.([a-z_]+)) \(([\s\S]*?)\n\);/gi;

		for (const migrationPath of migrationPaths) {
			const sql = readFileSync(join(process.cwd(), migrationPath), 'utf8');
			for (const match of sql.matchAll(createTablePattern)) {
				const table = match[1] ?? match[2];
				const body = match[3] ?? '';
				if (table === 'organizations' || /"?organization_id"?\s/.test(body) || /"?org_id"?\s/.test(body)) {
					orgOwnedTables.add(table);
				}
			}
		}

		const inventoryTables = new Set<string>(ORGANIZATION_EXPORT_SECTIONS.map((section) => section.table));
		const excludedTables = new Set<string>(ORGANIZATION_EXPORT_EXCLUDED_TABLES);
		const missing = [...orgOwnedTables]
			.filter((table) => !inventoryTables.has(table) && !excludedTables.has(table))
			.sort();

		expect(missing).toEqual([]);
	});
});
