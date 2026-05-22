import { describe, expect, it } from 'vitest';
import {
	assertOrganizationDataExportManifestIsSafe,
	getOrganizationDataExportReadableSheets,
	getOrganizationDataExportSections,
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
					key: 'ratingSchemeEntries',
					areaKey: 'rating-scheme',
					areaLabel: 'Evals'
				}),
				expect.objectContaining({
					key: 'dutyRosterTemplateRuns',
					areaKey: 'duty-rosters',
					areaLabel: 'Duty Rosters'
				})
			])
		);
		expect(ORGANIZATION_DATA_EXPORT_SECTIONS.every((section) => allowedAreaKeys.has(section.areaKey))).toBe(true);
	});

	it('filters raw and readable sections through the same selection Interface', () => {
		const rawSections = getOrganizationDataExportSections({ mode: 'areas', areas: ['personnel'] });
		const readableSheets = getOrganizationDataExportReadableSheets({ mode: 'areas', areas: ['personnel'] });

		expect(new Set(rawSections.map((section) => section.areaKey))).toEqual(new Set(['personnel']));
		expect(readableSheets.map((sheet) => sheet.name)).toContain('Personnel');
		expect(readableSheets.map((sheet) => sheet.name)).toContain('Personnel Documents');
		expect(readableSheets.map((sheet) => sheet.name)).not.toContain('Training Records');
	});
});
