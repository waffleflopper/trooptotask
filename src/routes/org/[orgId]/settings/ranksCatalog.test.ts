import { describe, expect, it } from 'vitest';
import type { SettingsRankCatalogRow } from './settingsSectionTypes';
import { RANK_LANE_ORDER, rankInUse, rankSentence } from './ranksCatalog';

function summary(active: { personnel: number; trainingApplicability: number }, historical: number, canDelete = false) {
	return {
		code: 'A',
		activeReferences: { ...active, total: active.personnel + active.trainingApplicability },
		historicalReferences: { signInRosterFilters: historical, signInRosterSnapshots: 0, total: historical },
		canDelete
	};
}

function rank(code: string, overrides: Partial<SettingsRankCatalogRow> = {}): SettingsRankCatalogRow {
	return {
		code,
		label: `${code} label`,
		service: 'custom',
		serviceLabel: 'Custom',
		category: 'custom',
		categoryLabel: 'Custom',
		payGrade: 'E-5',
		payGradeLabel: 'E-5',
		state: 'active',
		source: 'custom',
		sourceLabel: 'Custom',
		sortOrder: 500,
		referenceSummary: summary({ personnel: 0, trainingApplicability: 0 }, 0, true),
		warnings: [],
		commands: { canEdit: true, canRetire: true, canReactivate: false, canDelete: true, deleteDisabledReason: null },
		...overrides
	};
}

describe('rankInUse', () => {
	it.each([
		['people', summary({ personnel: 14, trainingApplicability: 1 }, 3), '14 people'],
		['one person', summary({ personnel: 1, trainingApplicability: 0 }, 0), '1 person'],
		['training filters only', summary({ personnel: 0, trainingApplicability: 2 }, 0), '2 in training'],
		['history only', summary({ personnel: 0, trainingApplicability: 0 }, 2), '2 in history'],
		['nothing', summary({ personnel: 0, trainingApplicability: 0 }, 0, true), 'Not in use'],
		['an unavailable reference check', summary({ personnel: 0, trainingApplicability: 0 }, 0), 'Unknown']
	])('reads %s', (_case, references, expected) => {
		expect(rankInUse(references).text).toBe(expected);
	});
});

describe('RANK_LANE_ORDER', () => {
	it('orders In use from unused to most held', () => {
		const ranks = [
			rank('PEOPLE-3', { referenceSummary: summary({ personnel: 3, trainingApplicability: 0 }, 0) }),
			rank('HISTORY', { referenceSummary: summary({ personnel: 0, trainingApplicability: 0 }, 9) }),
			rank('PEOPLE-1', { referenceSummary: summary({ personnel: 1, trainingApplicability: 0 }, 0) }),
			rank('UNUSED'),
			rank('TRAINING', { referenceSummary: summary({ personnel: 0, trainingApplicability: 2 }, 0) })
		];

		expect(ranks.sort(RANK_LANE_ORDER.inUse).map((entry) => entry.code)).toEqual([
			'UNUSED',
			'HISTORY',
			'TRAINING',
			'PEOPLE-1',
			'PEOPLE-3'
		]);
	});

	it('breaks a Source tie by rank precedence', () => {
		const ranks = [
			rank('E5', { source: 'built-in', sourceLabel: 'Built-in' }),
			rank('CUSTOM'),
			rank('E7', { source: 'built-in', sourceLabel: 'Built-in', payGrade: 'E-7' })
		];

		expect(ranks.sort(RANK_LANE_ORDER.source).map((entry) => entry.code)).toEqual(['E7', 'E5', 'CUSTOM']);
	});
});

describe('rankSentence', () => {
	it('gives the reason a rank cannot be removed, or says it can be', () => {
		expect(rankSentence(rank('A'))).toMatch(/can be removed/);
		expect(
			rankSentence(
				rank('B', {
					commands: {
						canEdit: true,
						canRetire: true,
						canReactivate: false,
						canDelete: false,
						deleteDisabledReason: 'Referenced ranks cannot be removed.'
					}
				})
			)
		).toBe('Referenced ranks cannot be removed.');
	});

	it('leads with the reference warnings when the rank has any', () => {
		const warned = rank('C', {
			warnings: ['Referenced by 3 active records or filters.', 'Also appears in 1 historical snapshot or saved filter.'],
			commands: {
				canEdit: true,
				canRetire: false,
				canReactivate: true,
				canDelete: false,
				deleteDisabledReason: 'Referenced by active Organization data; retire it instead.'
			}
		});

		expect(rankSentence(warned)).toBe(
			'Referenced by 3 active records or filters. Also appears in 1 historical snapshot or saved filter.'
		);
	});
});
