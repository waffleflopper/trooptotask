import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainingStatus } from '$features/training/training.types';
import {
	TRAINING_STATUS_SORT_ORDER,
	calculateExpirationDate,
	getDelinquentTrainings,
	getTrainingStats,
	getTrainingStatus,
	trainingExpirationDate
} from './trainingStatus';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '$features/training/training.types';

const AS_OF = '2026-06-15';
/** With the base 12-month type, a completion on these dates expires this many days after AS_OF. */
const COMPLETED_EXPIRING_IN = {
	'-5': '2025-06-10',
	'15': '2025-06-30',
	'30': '2025-07-15',
	'45': '2025-07-30',
	'60': '2025-08-14',
	'90': '2025-09-13'
} as const;
const dateOnlyType = () => baseType({ expirationDateOnly: true, expirationMonths: null });

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
		archivedAt: null,
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
			archivedAt: null,
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
		const personnel = [makePerson('p1'), makePerson('p2'), makePerson('p3')];
		const type = makeType();
		const trainings: PersonnelTraining[] = [
			{
				id: 't1',
				personnelId: 'p1',
				trainingTypeId: 'type-1',
				completionDate: COMPLETED_EXPIRING_IN['15'],
				expirationDate: null,
				notes: null,
				certificateUrl: null
			},
			{
				id: 't2',
				personnelId: 'p2',
				trainingTypeId: 'type-1',
				completionDate: COMPLETED_EXPIRING_IN['-5'],
				expirationDate: null,
				notes: null,
				certificateUrl: null
			}
		];

		const result = getDelinquentTrainings(personnel, [type], trainings, { asOf: AS_OF });

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
		const info = getTrainingStatus(
			baseTraining({ completionDate: COMPLETED_EXPIRING_IN['-5'] }),
			type,
			basePerson(),
			AS_OF
		);
		expect(info).toMatchObject({ status: 'exempt', label: 'Exempt', daysUntilExpiration: null, expirationDate: null });
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

	it('reports Current for a completed record of a type with no months, ignoring a stored date', () => {
		const info = getTrainingStatus(
			baseTraining({ expirationDate: '2020-01-01' }),
			baseType({ expirationMonths: null }),
			basePerson(),
			AS_OF
		);
		expect(info).toMatchObject({
			status: 'current',
			label: 'Current',
			daysUntilExpiration: null,
			expirationDate: null
		});
	});

	describe('expirationDateOnly types', () => {
		const type = dateOnlyType();

		it('reports Not Done when no expiration date is stored', () => {
			const info = getTrainingStatus(baseTraining({ completionDate: null, expirationDate: null }), type, basePerson());
			expect(info).toMatchObject({ status: 'not-completed', label: 'Not Done' });
		});

		it('classifies from the stored expiration date with no completion date', () => {
			const info = getTrainingStatus(
				baseTraining({ completionDate: null, expirationDate: '2026-09-13' }),
				type,
				basePerson(),
				AS_OF
			);
			expect(info).toMatchObject({
				status: 'current',
				label: 'Current',
				daysUntilExpiration: 90,
				expirationDate: '2026-09-13'
			});
		});
	});

	describe('dated classification', () => {
		const dated = (days: keyof typeof COMPLETED_EXPIRING_IN) =>
			baseTraining({ completionDate: COMPLETED_EXPIRING_IN[days] });

		it('reports expired with a days-ago label', () => {
			const info = getTrainingStatus(dated('-5'), baseType(), basePerson(), AS_OF);
			expect(info).toMatchObject({
				status: 'expired',
				label: 'Expired 5d ago',
				daysUntilExpiration: -5,
				expirationDate: '2026-06-10'
			});
		});

		it('reports warning-orange inside the orange window', () => {
			const info = getTrainingStatus(dated('15'), baseType(), basePerson(), AS_OF);
			expect(info).toMatchObject({ status: 'warning-orange', label: '15d left', daysUntilExpiration: 15 });
		});

		it('reports warning-yellow inside the yellow window', () => {
			const info = getTrainingStatus(dated('45'), baseType(), basePerson(), AS_OF);
			expect(info).toMatchObject({ status: 'warning-yellow', label: '45d left', daysUntilExpiration: 45 });
		});

		it('reports Current beyond the yellow window', () => {
			const info = getTrainingStatus(dated('90'), baseType(), basePerson(), AS_OF);
			expect(info).toMatchObject({ status: 'current', label: 'Current', daysUntilExpiration: 90 });
		});

		it('counts the orange threshold day itself as warning-orange', () => {
			const info = getTrainingStatus(dated('30'), baseType(), basePerson(), AS_OF);
			expect(info.status).toBe('warning-orange');
		});

		it('counts the yellow threshold day itself as warning-yellow', () => {
			const info = getTrainingStatus(dated('60'), baseType(), basePerson(), AS_OF);
			expect(info.status).toBe('warning-yellow');
		});
	});
});

describe('getTrainingStats', () => {
	it('buckets statuses across personnel and types', () => {
		const personnel = [basePerson({ id: 'p1' }), basePerson({ id: 'p2' })];
		const type = baseType();
		const trainings: PersonnelTraining[] = [
			baseTraining({ id: 'a', personnelId: 'p1', completionDate: COMPLETED_EXPIRING_IN['90'] }),
			baseTraining({ id: 'b', personnelId: 'p2', completionDate: COMPLETED_EXPIRING_IN['-5'] })
		];

		const stats = getTrainingStats(personnel, [type], trainings, undefined, AS_OF);
		expect(stats.total).toBe(2);
		expect(stats.current).toBe(1);
		expect(stats.expired).toBe(1);
	});
});

describe('getTrainingStatus asOf', () => {
	afterEach(() => vi.useRealTimers());

	it('classifies against today when asOf is omitted, exactly as with an explicit today', () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 8, 29, 15, 0));
		const type = baseType();
		const person = basePerson();
		const records = [
			baseTraining({ completionDate: '2025-12-15' }),
			baseTraining({ completionDate: '2025-10-15' }),
			baseTraining({ completionDate: '2025-09-28' }),
			baseTraining({ completionDate: null }),
			undefined
		];

		for (const training of records) {
			expect(getTrainingStatus(training, type, person)).toEqual(
				getTrainingStatus(training, type, person, '2026-09-29')
			);
		}
		expect(getTrainingStatus(records[1], type, person).status).toBe('warning-orange');
	});

	it.each([
		['2026-10-15', '2026-10-15', 'warning-orange', 0],
		['2026-10-15', '2026-10-16', 'expired', -1],
		['2028-02-29', '2028-02-29', 'warning-orange', 0],
		['2028-02-29', '2028-03-01', 'expired', -1],
		['2026-03-31', '2026-01-31', 'warning-yellow', 59]
	])('treats a record expiring %s as ready through that day when asOf is %s', (expiration, asOf, status, days) => {
		const result = getTrainingStatus(
			baseTraining({ completionDate: null, expirationDate: expiration }),
			dateOnlyType(),
			basePerson(),
			asOf
		);

		expect([result.status, result.daysUntilExpiration]).toEqual([status, days]);
	});

	it('counts calendar days across a daylight-saving change for Date and string asOf values', () => {
		const originalTimeZone = process.env.TZ;
		process.env.TZ = 'America/New_York';
		try {
			const training = baseTraining({ completionDate: null, expirationDate: '2026-11-02' });
			const type = dateOnlyType();
			const fromString = getTrainingStatus(training, type, basePerson(), '2026-10-31');
			const fromDate = getTrainingStatus(training, type, basePerson(), new Date(2026, 9, 31, 23, 30));

			expect([fromString.daysUntilExpiration, fromDate.daysUntilExpiration]).toEqual([2, 2]);
		} finally {
			if (originalTimeZone === undefined) delete process.env.TZ;
			else process.env.TZ = originalTimeZone;
		}
	});

	it('keeps never-expiring records current at any asOf, dated or not', () => {
		const type = baseType({ expirationMonths: null });
		const undated = getTrainingStatus(baseTraining({ completionDate: null }), type, basePerson(), '2099-01-01');
		const dated = getTrainingStatus(baseTraining(), type, basePerson(), '2099-01-01');

		expect([undated.status, dated.status]).toEqual(['current', 'current']);
		expect([undated.daysUntilExpiration, dated.daysUntilExpiration]).toEqual([null, null]);
	});
});

describe('trainingExpirationDate', () => {
	it('derives from the completion date and the type months, ignoring a stored date', () => {
		const completion = { completionDate: '2025-01-31', expirationDate: '2028-01-31' };

		expect(trainingExpirationDate(completion, { expirationDateOnly: false, expirationMonths: 1 })).toBe('2025-02-28');
		expect(trainingExpirationDate(completion, { expirationDateOnly: false, expirationMonths: null })).toBeNull();
	});

	it('takes the stored date for a date-only type', () => {
		const completion = { completionDate: null, expirationDate: '2027-03-04' };

		expect(trainingExpirationDate(completion, { expirationDateOnly: true, expirationMonths: 12 })).toBe('2027-03-04');
	});
});

describe('a Training Type whose months changed', () => {
	it('reads a completion saved under 36 months as expired by the current 12 months', () => {
		const stale = baseTraining({ completionDate: '2025-01-10', expirationDate: '2028-01-10' });

		const info = getTrainingStatus(stale, baseType({ expirationMonths: 12 }), basePerson(), '2026-03-01');

		expect(info).toMatchObject({
			status: 'expired',
			label: 'Expired 50d ago',
			daysUntilExpiration: -50,
			expirationDate: '2026-01-10'
		});
	});

	it('moves every completion when the months are lengthened', () => {
		const completion = baseTraining({ completionDate: '2025-01-10', expirationDate: '2026-01-10' });

		const info = getTrainingStatus(completion, baseType({ expirationMonths: 36 }), basePerson(), '2026-03-01');

		expect(info).toMatchObject({ status: 'current', daysUntilExpiration: 680, expirationDate: '2028-01-10' });
	});
});
