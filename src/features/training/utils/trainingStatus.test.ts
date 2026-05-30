import { describe, expect, it } from 'vitest';
import type { TrainingStatus } from '$features/training/training.types';
import {
	TRAINING_STATUS_SORT_ORDER,
	calculateExpirationDate,
	getDelinquentTrainings,
	getTrainingStats,
	getTrainingStatus
} from './trainingStatus';
import { formatDate } from '$lib/utils/dates';
import type { Personnel } from '$lib/types';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';

/** A YYYY-MM-DD string `days` calendar days from local midnight today. */
function isoDaysFromToday(days: number): string {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	d.setDate(d.getDate() + days);
	return formatDate(d);
}

function basePerson(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'p1',
		rank: 'SGT',
		lastName: 'Test',
		firstName: 'Pat',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'g1',
		groupName: 'Alpha',
		...overrides
	};
}

function baseType(overrides: Partial<TrainingType> = {}): TrainingType {
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
		isOptional: false,
		...overrides
	};
}

function baseTraining(overrides: Partial<PersonnelTraining> = {}): PersonnelTraining {
	return {
		id: 't1',
		personnelId: 'p1',
		trainingTypeId: 'type-1',
		completionDate: '2025-01-01',
		expirationDate: null,
		notes: null,
		certificateUrl: null,
		...overrides
	};
}

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

describe('calculateExpirationDate', () => {
	it('adds the expiration window using clamped month math', () => {
		expect(calculateExpirationDate('2026-04-14', 12)).toBe('2027-04-14');
		expect(calculateExpirationDate('2026-04-14', 3)).toBe('2026-07-14');
	});

	it('clamps month-end overflow instead of rolling into the next month', () => {
		// BUG-FIX (issue #1148): was `date.setMonth(+n)` which overflowed
		// 2026-01-31 + 1 month → 2026-03-03. Now clamps to the last valid day.
		expect(calculateExpirationDate('2026-01-31', 1)).toBe('2026-02-28');
	});

	it('returns null when there is nothing to compute', () => {
		expect(calculateExpirationDate(null, 12)).toBeNull();
		expect(calculateExpirationDate('2026-04-14', null)).toBeNull();
	});
});

describe('getTrainingStatus adapter', () => {
	it('reports exempt before anything else', () => {
		const type = baseType({ canBeExempted: true, exemptPersonnelIds: ['p1'] });
		const info = getTrainingStatus(baseTraining({ expirationDate: isoDaysFromToday(-5) }), type, basePerson());
		expect(info).toMatchObject({ status: 'exempt', label: 'Exempt', daysUntilExpiration: null });
	});

	it('reports N/A for optional training with no record', () => {
		const info = getTrainingStatus(undefined, baseType({ isOptional: true }), basePerson());
		expect(info).toMatchObject({ status: 'not-required', label: 'N/A' });
	});

	it('reports N/A for optional training whose record has no completion date', () => {
		const type = baseType({ isOptional: true });
		const info = getTrainingStatus(baseTraining({ completionDate: null, expirationDate: null }), type, basePerson());
		expect(info).toMatchObject({ status: 'not-required', label: 'N/A' });
	});

	it('reports Not Done for required training with no record', () => {
		const info = getTrainingStatus(undefined, baseType(), basePerson());
		expect(info).toMatchObject({ status: 'not-completed', label: 'Not Done' });
	});

	it('reports Current for a never-expires record (even with a null completion date)', () => {
		const type = baseType({ expirationMonths: null });
		const info = getTrainingStatus(baseTraining({ completionDate: null, expirationDate: null }), type, basePerson());
		expect(info).toMatchObject({ status: 'current', label: 'Current', daysUntilExpiration: null });
	});

	it('reports Current for a completed record with no stored expiration date', () => {
		const info = getTrainingStatus(baseTraining({ expirationDate: null }), baseType(), basePerson());
		expect(info).toMatchObject({ status: 'current', label: 'Current', daysUntilExpiration: null });
	});

	describe('expirationDateOnly types', () => {
		const type = baseType({ expirationDateOnly: true, expirationMonths: null });

		it('reports Not Done when no expiration date is stored', () => {
			const info = getTrainingStatus(baseTraining({ completionDate: null, expirationDate: null }), type, basePerson());
			expect(info).toMatchObject({ status: 'not-completed', label: 'Not Done' });
		});

		it('classifies from the stored expiration date with no completion date', () => {
			const info = getTrainingStatus(
				baseTraining({ completionDate: null, expirationDate: isoDaysFromToday(90) }),
				type,
				basePerson()
			);
			expect(info).toMatchObject({ status: 'current', label: 'Current', daysUntilExpiration: 90 });
		});
	});

	describe('dated classification', () => {
		it('reports expired with a days-ago label', () => {
			const info = getTrainingStatus(baseTraining({ expirationDate: isoDaysFromToday(-5) }), baseType(), basePerson());
			expect(info).toMatchObject({ status: 'expired', label: 'Expired 5d ago', daysUntilExpiration: -5 });
		});

		it('reports warning-orange inside the orange window', () => {
			const info = getTrainingStatus(baseTraining({ expirationDate: isoDaysFromToday(15) }), baseType(), basePerson());
			expect(info).toMatchObject({ status: 'warning-orange', label: '15d left', daysUntilExpiration: 15 });
		});

		it('reports warning-yellow inside the yellow window', () => {
			const info = getTrainingStatus(baseTraining({ expirationDate: isoDaysFromToday(45) }), baseType(), basePerson());
			expect(info).toMatchObject({ status: 'warning-yellow', label: '45d left', daysUntilExpiration: 45 });
		});

		it('reports Current beyond the yellow window', () => {
			const info = getTrainingStatus(baseTraining({ expirationDate: isoDaysFromToday(90) }), baseType(), basePerson());
			expect(info).toMatchObject({ status: 'current', label: 'Current', daysUntilExpiration: 90 });
		});

		// BUG-FIX (issue #1148): inclusive `<=` boundary.
		it('counts the orange threshold day itself as warning-orange', () => {
			// days === warningDaysOrange (30). Was `warning-yellow` under the old strict `<`; now warning-orange.
			const info = getTrainingStatus(baseTraining({ expirationDate: isoDaysFromToday(30) }), baseType(), basePerson());
			expect(info.status).toBe('warning-orange');
		});

		it('counts the yellow threshold day itself as warning-yellow', () => {
			// days === warningDaysYellow (60). Was `current` under the old strict `<`; now warning-yellow.
			const info = getTrainingStatus(baseTraining({ expirationDate: isoDaysFromToday(60) }), baseType(), basePerson());
			expect(info.status).toBe('warning-yellow');
		});
	});
});

describe('getTrainingStats', () => {
	it('buckets statuses across personnel and types', () => {
		const personnel = [basePerson({ id: 'p1' }), basePerson({ id: 'p2' })];
		const type = baseType();
		const trainings: PersonnelTraining[] = [
			{ ...baseTraining({ id: 'a', personnelId: 'p1', expirationDate: isoDaysFromToday(90) }) },
			{ ...baseTraining({ id: 'b', personnelId: 'p2', expirationDate: isoDaysFromToday(-5) }) }
		];

		const stats = getTrainingStats(personnel, [type], trainings);
		expect(stats.total).toBe(2);
		expect(stats.current).toBe(1);
		expect(stats.expired).toBe(1);
	});
});
