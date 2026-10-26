import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { TrainingCompletionFacts, TrainingType } from '../training.types';
import {
	buildTrainingBriefing,
	summarizeTrainingReadiness,
	trainingMatrixGaps,
	type TrainingReadinessInput
} from './trainingBriefing';

function person(id: string, mos = '68W'): Personnel {
	return { id, rank: 'SGT', firstName: 'Pat', lastName: id, mos, clinicRole: 'Medic', groupName: 'Alpha' };
}

function type(id: string, overrides: Partial<TrainingType> = {}): TrainingType {
	return {
		id,
		name: id,
		description: null,
		expirationMonths: 12,
		warningDaysYellow: 60,
		warningDaysOrange: 30,
		appliesToRoles: [],
		appliesToMos: [],
		appliesToRanks: [],
		excludedRoles: [],
		excludedMos: [],
		excludedRanks: [],
		color: '#000000',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

function record(
	personnelId: string,
	trainingTypeId: string,
	expirationDate: string | null,
	completionDate: string | null = '2026-01-01'
): TrainingCompletionFacts {
	return { personnelId, trainingTypeId, expirationDate, completionDate };
}

function fixture(): TrainingReadinessInput {
	return {
		personnel: [person('able'), person('baker', '11B'), person('cole')],
		types: [
			type('annual'),
			type('card', { expirationDateOnly: true, expirationMonths: null }),
			type('never', { expirationMonths: null }),
			type('exempt', { canBeExempted: true, exemptPersonnelIds: ['able', 'baker', 'cole'] }),
			type('targeted', { appliesToMos: ['68W'] }),
			type('optional', { isOptional: true })
		],
		records: [
			record('able', 'annual', '2026-10-28'),
			record('baker', 'annual', '2026-09-28'),
			record('cole', 'annual', '2026-10-29'),
			record('able', 'card', '2026-09-29', null),
			record('baker', 'card', '2026-10-29', null),
			record('able', 'never', null, null),
			record('cole', 'never', null),
			record('able', 'exempt', '2025-01-01'),
			record('cole', 'targeted', '2030-01-01'),
			record('able', 'optional', '2025-01-01'),
			record('baker', 'optional', '2026-10-01')
		],
		asOf: '2026-09-29',
		horizonDays: 30,
		goalPercent: 90
	};
}

describe('Training readiness', () => {
	it('counts requirements and projects the first expired day, excluding optional types from readiness', () => {
		const input = fixture();
		const summary = summarizeTrainingReadiness(input);

		expect(summary).toEqual({
			asOf: '2026-09-29',
			horizonEnd: '2026-10-29',
			horizonEndLabel: '29 Oct',
			goalPercent: 90,
			today: { ready: 7, applicable: 11, percent: 64, band: 'far' },
			horizon: { ready: 5, applicable: 11, percent: 45, band: 'critical' },
			expired: 1,
			notRecorded: 3,
			lapsing: 2
		});
		const briefing = buildTrainingBriefing({ ...input, filters: {}, rowsBy: 'group', scopeName: 'Test Company' });
		expect(briefing.bottomLine).toMatchObject({
			asOf: summary.asOf,
			horizonEnd: summary.horizonEnd,
			horizonEndLabel: summary.horizonEndLabel,
			today: summary.today,
			horizon: summary.horizon,
			expired: summary.expired,
			notRecorded: summary.notRecorded,
			lapsing: summary.lapsing
		});
	});

	it('returns per-column gaps for all columns, including optional types and zero-filled exemptions', () => {
		expect(trainingMatrixGaps(fixture())).toEqual({
			readiness: { ready: 7, applicable: 11, percent: 64, band: 'far' },
			byType: {
				annual: { notReady: 1, lapsing: 1 },
				card: { notReady: 1, lapsing: 1 },
				never: { notReady: 1, lapsing: 0 },
				exempt: { notReady: 0, lapsing: 0 },
				targeted: { notReady: 1, lapsing: 0 },
				optional: { notReady: 1, lapsing: 1 }
			}
		});
	});

	it('uses only the supplied people and columns for a filtered group or footer', () => {
		const input = fixture();
		expect(
			trainingMatrixGaps({
				...input,
				personnel: [person('able')],
				types: [type('annual'), type('optional', { isOptional: true })]
			})
		).toEqual({
			readiness: { ready: 1, applicable: 1, percent: 100, band: 'goal' },
			byType: { annual: { notReady: 0, lapsing: 1 }, optional: { notReady: 1, lapsing: 0 } }
		});
	});

	it('returns no readiness percentage or band when no requirement contributes to readiness', () => {
		const input = {
			...fixture(),
			personnel: [person('baker', '11B')],
			types: [
				type('targeted', { appliesToMos: ['68W'] }),
				type('exempt', { canBeExempted: true, exemptPersonnelIds: ['baker'] }),
				type('optional', { isOptional: true })
			]
		};
		expect(trainingMatrixGaps(input)).toEqual({
			readiness: { ready: 0, applicable: 0, percent: null, band: 'none' },
			byType: {
				targeted: { notReady: 0, lapsing: 0 },
				exempt: { notReady: 0, lapsing: 0 },
				optional: { notReady: 0, lapsing: 1 }
			}
		});
		expect(summarizeTrainingReadiness(input)).toMatchObject({
			today: { ready: 0, applicable: 0, percent: null, band: 'none' },
			horizon: { ready: 0, applicable: 0, percent: null, band: 'none' },
			expired: 0,
			notRecorded: 0,
			lapsing: 0
		});
	});
});
