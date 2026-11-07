import { describe, expect, it } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import type { PersonnelTraining, TrainingType } from '../training.types';
import { dueSoonByType } from './dueSoon';

const AS_OF = '2026-11-01';

function person(id: string, lastName: string): Personnel {
	return { id, rank: 'SGT', lastName, firstName: 'Pat', mos: '68W', clinicRole: '', groupId: 'g1', groupName: 'Alpha' };
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
		color: '#22c55e',
		sortOrder: 0,
		expirationDateOnly: false,
		canBeExempted: false,
		exemptPersonnelIds: [],
		isOptional: false,
		...overrides
	};
}

function record(personnelId: string, trainingTypeId: string, expirationDate: string): PersonnelTraining {
	return {
		id: `${personnelId}-${trainingTypeId}`,
		personnelId,
		trainingTypeId,
		completionDate: '2025-11-01',
		expirationDate,
		notes: null,
		certificateUrl: null
	};
}

describe('dueSoonByType', () => {
	it('lists orange and yellow People and leaves out expired, missing, current and exempt ones', () => {
		const people = [
			person('orange', 'Adams'),
			person('yellow', 'Baker'),
			person('expired', 'Cole'),
			person('missing', 'Dunn'),
			person('current', 'Estes'),
			person('exempt', 'Ford')
		];
		const cpr = type('cpr', { canBeExempted: true, exemptPersonnelIds: ['exempt'] });
		const trainings = [
			record('orange', 'cpr', '2026-11-11'),
			record('yellow', 'cpr', '2026-12-21'),
			record('expired', 'cpr', '2026-10-31'),
			record('current', 'cpr', '2027-06-01'),
			record('exempt', 'cpr', '2026-11-11')
		];

		expect(dueSoonByType(people, [cpr], trainings, AS_OF)).toEqual([
			{
				trainingTypeId: 'cpr',
				people: [
					{ personnelId: 'orange', daysLeft: 10, status: 'warning-orange' },
					{ personnelId: 'yellow', daysLeft: 50, status: 'warning-yellow' }
				]
			}
		]);
	});

	it('counts the day a record expires as due soon with 0 days left, and the next day as expired', () => {
		const people = [person('today', 'Adams'), person('yesterday', 'Baker')];
		const trainings = [record('today', 'cpr', AS_OF), record('yesterday', 'cpr', '2026-10-31')];

		expect(dueSoonByType(people, [type('cpr')], trainings, AS_OF)).toEqual([
			{ trainingTypeId: 'cpr', people: [{ personnelId: 'today', daysLeft: 0, status: 'warning-orange' }] }
		]);
	});

	it('puts the soonest People first, keeping the roster order on equal days', () => {
		const people = [person('b', 'Baker'), person('a', 'Adams'), person('c', 'Cole'), person('d', 'Dunn')];
		const trainings = [
			record('b', 'cpr', '2026-11-20'),
			record('a', 'cpr', '2026-11-20'),
			record('c', 'cpr', '2026-11-05'),
			record('d', 'cpr', '2026-12-30')
		];

		const [cpr] = dueSoonByType(people, [type('cpr')], trainings, AS_OF);

		expect(cpr.people.map((p) => [p.personnelId, p.daysLeft])).toEqual([
			['c', 4],
			['b', 19],
			['a', 19],
			['d', 59]
		]);
	});

	it('orders types by their soonest Person, then by name', () => {
		const people = [person('p1', 'Adams'), person('p2', 'Baker')];
		const types = [type('zulu', { name: 'Zulu' }), type('alpha', { name: 'Alpha' }), type('mike', { name: 'Mike' })];
		const trainings = [
			record('p1', 'zulu', '2026-11-04'),
			record('p2', 'alpha', '2026-11-04'),
			record('p1', 'mike', '2026-11-02')
		];

		expect(dueSoonByType(people, types, trainings, AS_OF).map((entry) => entry.trainingTypeId)).toEqual([
			'mike',
			'alpha',
			'zulu'
		]);
	});

	it('returns nothing when no one is inside a warning window', () => {
		expect(dueSoonByType([person('p1', 'Adams')], [type('cpr')], [record('p1', 'cpr', '2027-06-01')], AS_OF)).toEqual(
			[]
		);
	});
});
