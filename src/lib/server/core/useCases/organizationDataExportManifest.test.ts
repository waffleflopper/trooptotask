import { describe, expect, it } from 'vitest';
import {
	assertOrganizationDataExportManifestIsSafe,
	ORGANIZATION_DATA_EXPORT_AREA_KEYS,
	ORGANIZATION_DATA_EXPORT_SECTIONS
} from './organizationDataExportManifest';

describe('Organization Data Export manifest', () => {
	it('keeps section keys safe and unique', () => {
		expect(() => assertOrganizationDataExportManifestIsSafe()).not.toThrow();
		const keys = ORGANIZATION_DATA_EXPORT_SECTIONS.map((section) => section.key);

		expect(new Set(keys).size).toBe(keys.length);
	});

	it('owns area keys and human-readable area labels for every raw section', () => {
		const allowedAreaKeys = new Set<string>(ORGANIZATION_DATA_EXPORT_AREA_KEYS);

		expect(ORGANIZATION_DATA_EXPORT_SECTIONS).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: 'organizationProfile',
					areaKey: 'settings',
					areaLabel: 'Settings'
				}),
				expect.objectContaining({
					key: 'organizationRankCatalog',
					table: 'organization_rank_catalog',
					areaKey: 'settings',
					areaLabel: 'Settings'
				}),
				expect.objectContaining({
					key: 'ratingSchemeEntries',
					areaKey: 'rating-scheme',
					areaLabel: 'Evals'
				}),
				expect.objectContaining({
					key: 'dailyAssignments',
					table: 'daily_assignments',
					areaKey: 'calendar',
					areaLabel: 'Calendar'
				})
			])
		);
		expect(ORGANIZATION_DATA_EXPORT_SECTIONS.every((section) => allowedAreaKeys.has(section.areaKey))).toBe(true);
	});
});
