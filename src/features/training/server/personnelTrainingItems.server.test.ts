import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, SavedTrainingType, TrainingCompletionHistoryEntry, TrainingType } from '../contracts';
import { describeTrainingItem } from '../utils/personnelTrainingItems';
import { loadPersonnelTrainingReadiness } from './personnelTrainingItems.server';

const person = { id: 'okafor', rank: 'SGT', mos: '68W', clinicRole: 'Treatment NCO' } as Personnel;

function type(id: string, name: string, overrides: Partial<TrainingType> = {}): SavedTrainingType {
	return {
		id,
		name,
		organization_id: 'org-1',
		created_at: '2026-01-01',
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
		exemptPersonnelIds: [],
		canBeExempted: false,
		expirationDateOnly: false,
		isOptional: false,
		color: '#000000',
		sortOrder: 0,
		...overrides
	};
}

function completion(typeId: string, completionDate: string, expirationDate: string | null): PersonnelTraining {
	return {
		id: `${typeId}-record`,
		personnelId: person.id,
		trainingTypeId: typeId,
		completionDate,
		expirationDate,
		notes: null,
		certificateUrl: null
	};
}

function superseded(id: string, typeId: string, completionDate: string): TrainingCompletionHistoryEntry {
	return {
		id,
		personnelId: person.id,
		trainingTypeId: typeId,
		completionDate,
		expirationDate: null,
		notes: null,
		certificateUrl: null,
		supersededAt: '2026-10-01T00:00:00Z'
	};
}

describe('loadPersonnelTrainingReadiness', () => {
	it('ranks required items, explains applicability and counts what is not required or exempt', async () => {
		const readiness = await loadPersonnelTrainingReadiness({
			trainingCatalog: {
				listTypes: async () => [
					type('hipaa', 'HIPAA'),
					type('cpr', 'CPR / BLS', { expirationMonths: 24, appliesToMos: ['68W'] }),
					type('sharp', 'SHARP', { appliesToRoles: ['Treatment NCO'] }),
					type('jumpmaster', 'Jumpmaster', { appliesToMos: ['11B'] }),
					type('optional', 'Combatives', { isOptional: true }),
					type('pt', 'Profile review', { canBeExempted: true, exemptPersonnelIds: ['okafor'] }),
					type('nco', 'SLC', { appliesToRanks: ['SGT'], expirationMonths: null })
				]
			},
			trainingCompletions: {
				listPersonCompletions: async () => [
					completion('hipaa', '2026-04-01', '2027-04-01'),
					completion('cpr', '2024-09-24', '2026-09-24'),
					completion('sharp', '2025-11-01', '2026-11-01'),
					completion('nco', '2025-01-01', null)
				],
				listPersonHistory: async () => [
					superseded('older', 'cpr', '2020-09-24'),
					superseded('newer', 'cpr', '2022-09-24')
				]
			},
			asOf: '2026-10-06',
			loadAuthorizedPerson: async () => person
		});

		expect(
			readiness.items.map((item) => [item.typeId, item.status, item.daysUntilExpiration, item.applicability])
		).toEqual([
			['cpr', 'expired', -12, { kind: 'mos', mos: '68W' }],
			['sharp', 'expiring', 26, { kind: 'role', role: 'Treatment NCO' }],
			['hipaa', 'current', 177, { kind: 'all' }],
			['nco', 'current', null, { kind: 'rank', rank: 'SGT' }]
		]);
		expect(readiness.items.map(describeTrainingItem)).toEqual([
			'24-month cycle · lapsed 12 days ago',
			'12-month cycle · expires in 26 days',
			'12-month cycle',
			'Does not expire'
		]);
		expect(readiness.items[0].history.map((entry) => entry.id)).toEqual(['newer', 'older']);
		expect(readiness.items[0].completion?.id).toBe('cpr-record');
		expect([readiness.mos, readiness.notRequiredCount, readiness.exemptCount]).toEqual(['68W', 2, 1]);
	});

	it('lists a required type with no record as missing', async () => {
		const readiness = await loadPersonnelTrainingReadiness({
			trainingCatalog: { listTypes: async () => [type('cyber', 'Cyber Awareness')] },
			trainingCompletions: { listPersonCompletions: async () => [], listPersonHistory: async () => [] },
			asOf: '2026-10-06',
			loadAuthorizedPerson: async () => person
		});

		expect(readiness.items.map((item) => [item.name, item.status, item.completion])).toEqual([
			['Cyber Awareness', 'missing', null]
		]);
		expect(readiness.items.map(describeTrainingItem)).toEqual(['12-month cycle · required for all Soldiers']);
	});

	it('reads nothing when the Person is not admitted', async () => {
		const reads: string[] = [];
		const result = loadPersonnelTrainingReadiness({
			trainingCatalog: {
				listTypes: async () => {
					reads.push('types');
					return [];
				}
			},
			trainingCompletions: {
				listPersonCompletions: async () => {
					reads.push('completions');
					return [];
				},
				listPersonHistory: async () => {
					reads.push('history');
					return [];
				}
			},
			asOf: '2026-10-06',
			loadAuthorizedPerson: async () => {
				throw new Error('Forbidden');
			}
		});

		await expect(result).rejects.toThrow('Forbidden');
		expect(reads).toEqual([]);
	});
});
