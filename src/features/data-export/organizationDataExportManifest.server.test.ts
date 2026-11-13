import { describe, expect, it } from 'vitest';
import {
	assertOrganizationDataExportManifestIsSafe,
	ORGANIZATION_DATA_EXPORT_AREA_KEYS,
	ORGANIZATION_DATA_EXPORT_READABLE_SHEETS,
	ORGANIZATION_DATA_EXPORT_SECTIONS,
	type OrganizationDataExportLabels
} from './organizationDataExportManifest.server';

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
					key: 'ratingSchemes',
					table: 'rating_schemes',
					areaKey: 'rating-scheme',
					areaLabel: 'Evals'
				}),
				expect.objectContaining({
					key: 'evaluations',
					table: 'evaluations',
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

	it('names a signed evaluator by Personnel label, else the name kept with the Evaluation, else the id', () => {
		const labels: OrganizationDataExportLabels = {
			personnel: new Map([
				['rated-1', 'SGT Rated'],
				['rater-1', 'SSG Rater']
			]),
			groups: new Map(),
			statusTypes: new Map(),
			assignmentTypes: new Map(),
			assignmentTargets: new Map(),
			trainingTypes: new Map(),
			criticalTasks: new Map(),
			extendedInfoByPerson: new Map()
		};
		const evaluation = (
			rater: string | null,
			raterName: string | null,
			senior: string | null,
			seniorName: string | null
		) => ({
			rated_person_id: 'rated-1',
			snapshot_rater_person_id: rater,
			snapshot_rater_name: raterName,
			snapshot_senior_rater_person_id: senior,
			snapshot_senior_rater_name: seniorName
		});
		const sheet = ORGANIZATION_DATA_EXPORT_READABLE_SHEETS.find((candidate) => candidate.name === 'Evaluations');

		const rows = sheet?.rows(
			{
				evaluations: [
					evaluation('rater-1', 'Name kept', 'gone-1', 'COL Kept'),
					evaluation(null, 'SSG Named', 'gone-2', null)
				]
			},
			labels
		);

		expect(rows?.map((row) => [row.signed_rater, row.signed_senior_rater])).toEqual([
			['SSG Rater', 'COL Kept'],
			['SSG Named', 'gone-2']
		]);
	});
});
