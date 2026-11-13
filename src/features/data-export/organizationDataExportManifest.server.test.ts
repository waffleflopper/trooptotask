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
		const signed = (
			rater: string | null,
			raterName: string | null,
			senior: string | null,
			seniorName: string | null
		) => ({
			rated_person_id: 'rated-1',
			rating_scheme_id: 'scheme-listed',
			chain_snapshot_at: '2026-10-01T00:00:00Z',
			snapshot_rater_person_id: rater,
			snapshot_rater_name: raterName,
			snapshot_senior_rater_person_id: senior,
			snapshot_senior_rater_name: seniorName,
			snapshot_intermediate_rater_person_id: null,
			snapshot_intermediate_rater_name: 'MSG Intermediate',
			snapshot_reviewer_person_id: 'rater-1',
			snapshot_reviewer_name: null
		});

		const rows = evaluationRows([
			signed('rater-1', 'Name kept', 'gone-1', 'COL Kept'),
			signed(null, 'SSG Named', 'gone-2', null)
		]);

		expect(rows?.map((row) => [row.rater, row.senior_rater, row.intermediate_rater, row.reviewer])).toEqual([
			['SSG Rater', 'COL Kept', 'MSG Intermediate', 'SSG Rater'],
			['SSG Named', 'gone-2', 'MSG Intermediate', 'SSG Rater']
		]);
	});

	it("shows an unsigned Evaluation's chain from its own scheme, not the Person's listed scheme", () => {
		const rows = evaluationRows([
			{ rated_person_id: 'rated-1', rating_scheme_id: 'scheme-archived', chain_snapshot_at: null },
			{ rated_person_id: 'rated-1', rating_scheme_id: 'scheme-listed', chain_snapshot_at: null }
		]);

		expect(rows?.map((row) => [row.rater, row.senior_rater])).toEqual([
			['SSG Rater', 'COL Archived'],
			['SFC Listed', 'COL Listed']
		]);
	});
});

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

const scheme = (id: string, rater: string | null, raterName: string | null, seniorName: string) => ({
	id,
	rated_person_id: 'rated-1',
	rater_person_id: rater,
	rater_name: raterName,
	senior_rater_person_id: null,
	senior_rater_name: seniorName,
	intermediate_rater_person_id: null,
	intermediate_rater_name: null,
	reviewer_person_id: null,
	reviewer_name: null
});

function evaluationRows(evaluations: Record<string, unknown>[]) {
	const sheet = ORGANIZATION_DATA_EXPORT_READABLE_SHEETS.find((candidate) => candidate.name === 'Evaluations');
	return sheet?.rows(
		{
			ratingSchemes: [
				scheme('scheme-archived', 'rater-1', null, 'COL Archived'),
				scheme('scheme-listed', null, 'SFC Listed', 'COL Listed')
			],
			evaluations
		},
		labels
	);
}
