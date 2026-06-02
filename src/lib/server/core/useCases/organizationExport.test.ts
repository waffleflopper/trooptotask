import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { globSync } from 'node:fs';
import type { DataStore } from '../ports';
import {
	loadOrganizationExportPayload,
	ORGANIZATION_EXPORT_QUERY_BATCH_SIZE,
	ORGANIZATION_EXPORT_SECTIONS
} from './organizationExport';

const ORGANIZATION_EXPORT_EXCLUDED_TABLES = [
	'access_requests',
	'account_setup_links',
	'announcement_dismissals',
	'counseling_types',
	'development_goals',
	'platform_admins',
	'platform_announcements',
	'stripe_webhook_events',
	'user_profiles',
	'user_suspensions'
] as const;

describe('organization export inventory', () => {
	it('keeps section keys unique and separate from export metadata keys', () => {
		const reservedPayloadKeys = new Set(['exportedAt', 'organizationId', 'sectionInventory', 'sections']);
		const keys = ORGANIZATION_EXPORT_SECTIONS.map((section) => section.key);

		expect(new Set(keys).size).toBe(keys.length);
		expect(keys.filter((key) => reservedPayloadKeys.has(key))).toEqual([]);
	});

	it('caps concurrent organization table reads while building the export payload', async () => {
		let activeReads = 0;
		let maxActiveReads = 0;
		let calls = 0;
		const store = {
			async findMany(table: string) {
				calls += 1;
				activeReads += 1;
				maxActiveReads = Math.max(maxActiveReads, activeReads);
				await new Promise((resolve) => setTimeout(resolve, 0));
				activeReads -= 1;
				return [{ table }];
			}
		} as Pick<DataStore, 'findMany'> as DataStore;

		const payload = await loadOrganizationExportPayload(store, 'org-1');

		expect(calls).toBe(ORGANIZATION_EXPORT_SECTIONS.length);
		expect(maxActiveReads).toBeLessThanOrEqual(ORGANIZATION_EXPORT_QUERY_BATCH_SIZE);
		expect(payload.sectionInventory.length).toBe(ORGANIZATION_EXPORT_SECTIONS.length);
		expect(payload.sectionInventory[0]).toHaveProperty('areaKey');
		expect(typeof payload.sectionInventory[0]?.areaKey).toBe('string');
	});

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
