import { describe, expect, it } from 'vitest';
import type { DataStore } from '../ports';
import {
	loadOrganizationExportPayload,
	ORGANIZATION_EXPORT_QUERY_BATCH_SIZE,
	ORGANIZATION_EXPORT_SECTIONS
} from './organizationExport';

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
});
