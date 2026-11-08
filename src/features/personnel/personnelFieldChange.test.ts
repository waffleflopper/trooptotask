import { describe, expect, it } from 'vitest';
import type { Personnel } from './personnel.types';
import { personnelFieldDisplay, planPersonnelFieldChange, withFieldChange } from './personnelFieldChange';

const person = (id: string, overrides: Partial<Personnel> = {}): Personnel => ({
	id,
	rank: 'SGT',
	lastName: id,
	firstName: 'Pat',
	mos: '68W',
	clinicRole: 'Medic',
	ets: null,
	groupId: null,
	groupName: '',
	...overrides
});

describe('planPersonnelFieldChange', () => {
	it('lists only the People whose value differs, with their current value, and counts the rest as already set', () => {
		const people = [person('a'), person('b', { rank: 'SSG' }), person('c', { rank: 'SPC' })];

		const plan = planPersonnelFieldChange(people, { field: 'rank', value: 'SSG' });

		expect(plan.changing.map(({ person: changing, from }) => [changing.id, from])).toEqual([
			['a', 'SGT'],
			['c', 'SPC']
		]);
		expect(plan.alreadySet).toBe(1);
	});

	it('treats a missing ETS as different from a date and the same date as already set', () => {
		const people = [person('a'), person('b', { ets: '2027-03-04' })];

		const plan = planPersonnelFieldChange(people, { field: 'ets', value: '2027-03-04' });

		expect(plan.changing.map(({ person: changing, from }) => [changing.id, from])).toEqual([['a', '']]);
		expect(plan.alreadySet).toBe(1);
	});
});

describe('withFieldChange', () => {
	it('changes only the chosen field', () => {
		expect(withFieldChange(person('a'), { field: 'clinicRole', value: 'Driver' })).toEqual(
			person('a', { clinicRole: 'Driver' })
		);
		expect(withFieldChange(person('a'), { field: 'ets', value: '2027-03-04' })).toEqual(
			person('a', { ets: '2027-03-04' })
		);
	});
});

describe('personnelFieldDisplay', () => {
	it('shows an empty value as None and an ETS day-month-year', () => {
		expect(personnelFieldDisplay('mos', '')).toBe('None');
		expect(personnelFieldDisplay('ets', '2027-03-04')).toBe('4 Mar 2027');
		expect(personnelFieldDisplay('rank', 'SSG')).toBe('SSG');
	});
});
