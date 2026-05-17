import { describe, expect, it } from 'vitest';
import type { TrainingStatus } from '$features/training/training.types';
import { TRAINING_STATUS_SORT_ORDER, getDelinquentTrainings } from './trainingStatus';
import type { Personnel } from '$lib/types';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';

describe('TRAINING_STATUS_SORT_ORDER', () => {
	it('assigns every TrainingStatus a unique numeric rank', () => {
		const allStatuses: TrainingStatus[] = [
			'expired',
			'warning-orange',
			'warning-yellow',
			'not-completed',
			'current',
			'not-required',
			'exempt'
		];

		const values = allStatuses.map((s) => TRAINING_STATUS_SORT_ORDER[s]);
		expect(new Set(values).size).toBe(allStatuses.length);
	});

	it('orders expired as most urgent and exempt as least urgent', () => {
		expect(TRAINING_STATUS_SORT_ORDER['expired']).toBeLessThan(TRAINING_STATUS_SORT_ORDER['current']);
		expect(TRAINING_STATUS_SORT_ORDER['warning-orange']).toBeLessThan(TRAINING_STATUS_SORT_ORDER['warning-yellow']);
		expect(TRAINING_STATUS_SORT_ORDER['current']).toBeLessThan(TRAINING_STATUS_SORT_ORDER['not-required']);
		expect(TRAINING_STATUS_SORT_ORDER['not-required']).toBeLessThan(TRAINING_STATUS_SORT_ORDER['exempt']);
	});

	it('covers all TrainingStatus values', () => {
		const allStatuses: TrainingStatus[] = [
			'expired',
			'warning-orange',
			'warning-yellow',
			'not-completed',
			'current',
			'not-required',
			'exempt'
		];
		for (const status of allStatuses) {
			expect(TRAINING_STATUS_SORT_ORDER[status]).toBeDefined();
		}
	});
});

describe('getDelinquentTrainings sort order', () => {
	function makePerson(id: string): Personnel {
		return {
			id,
			rank: 'SGT',
			lastName: 'Test',
			firstName: id,
			mos: '68W',
			clinicRole: 'Medic',
			groupId: 'g1',
			groupName: 'Alpha'
		};
	}

	function makeType(): TrainingType {
		return {
			id: 'type-1',
			name: 'CPR',
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
			color: '#22c55e',
			sortOrder: 0,
			expirationDateOnly: false,
			canBeExempted: false,
			exemptPersonnelIds: [],
			isOptional: false
		};
	}

	it('sorts expired before warning-orange before not-completed', () => {
		const today = new Date();
		const past = new Date(today);
		past.setDate(past.getDate() - 10);
		const soon = new Date(today);
		soon.setDate(soon.getDate() + 15);

		const personnel = [makePerson('p1'), makePerson('p2'), makePerson('p3')];
		const type = makeType();
		const trainings: PersonnelTraining[] = [
			{
				id: 't1',
				personnelId: 'p1',
				trainingTypeId: 'type-1',
				completionDate: '2024-01-01',
				expirationDate: soon.toISOString().split('T')[0],
				notes: null,
				certificateUrl: null
			},
			{
				id: 't2',
				personnelId: 'p2',
				trainingTypeId: 'type-1',
				completionDate: '2024-01-01',
				expirationDate: past.toISOString().split('T')[0],
				notes: null,
				certificateUrl: null
			}
		];

		const result = getDelinquentTrainings(personnel, [type], trainings);

		expect(result[0].person.id).toBe('p2');
		expect(result[0].statusInfo.status).toBe('expired');
		expect(result[1].statusInfo.status).toBe('warning-orange');
		expect(result[2].person.id).toBe('p3');
		expect(result[2].statusInfo.status).toBe('not-completed');
	});
});
