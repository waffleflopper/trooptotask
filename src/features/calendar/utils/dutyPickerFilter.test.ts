import { describe, expect, it } from 'vitest';
import { applyDutyFilter, dutyFilterValues, EMPTY_DUTY_FILTER, type DutyPickerFilter } from './dutyPickerFilter';
import type { DutyPickerOption } from './dutyPickerOptions';

function person(id: string, rank: string, role: string, mos: string, current = false): DutyPickerOption {
	return {
		kind: 'personnel',
		id,
		label: id,
		prefix: rank,
		role,
		mos,
		current,
		lastDuty: { kind: 'none' }
	};
}

const filter = (selected: Partial<DutyPickerFilter>): DutyPickerFilter => ({ ...EMPTY_DUTY_FILTER, ...selected });
const ids = (options: readonly DutyPickerOption[]) => options.map((option) => option.id);

const roster = [
	person('hale', 'SSG', 'Medic', '68W'),
	person('okafor', 'SGT', 'Medic', '68W'),
	person('liang', 'SPC', 'Driver', '88M'),
	person('ortiz', 'SPC', 'Medic', '68W'),
	person('reed', 'PFC', 'Driver', '88M'),
	person('blank', 'SPC', ' ', '')
];

describe('dutyFilterValues', () => {
	it('lists ranks highest first, and roles and MOS alphabetically, without blanks or repeats', () => {
		expect(dutyFilterValues(roster, 'rank')).toEqual(['SSG', 'SGT', 'SPC', 'PFC']);
		expect(dutyFilterValues(roster, 'role')).toEqual(['Driver', 'Medic']);
		expect(dutyFilterValues(roster, 'mos')).toEqual(['68W', '88M']);
	});

	it('ignores Groups', () => {
		expect(dutyFilterValues([{ kind: 'group', id: 'g', label: 'Alpha', current: false }], 'rank')).toEqual([]);
	});

	it('trims values before listing them', () => {
		expect(dutyFilterValues([person('a', 'SPC', ' Medic ', '68W')], 'role')).toEqual(['Medic']);
	});
});

describe('applyDutyFilter', () => {
	it('returns everyone for an empty filter', () => {
		expect(ids(applyDutyFilter(roster, EMPTY_DUTY_FILTER))).toEqual(ids(roster));
	});

	it('accepts any selected value within one facet', () => {
		expect(ids(applyDutyFilter(roster, filter({ rank: ['SSG', 'PFC'] })))).toEqual(['hale', 'reed']);
	});

	it('requires a match in every facet that has a selection', () => {
		expect(ids(applyDutyFilter(roster, filter({ rank: ['SPC', 'PFC'], role: ['Driver'] })))).toEqual(['liang', 'reed']);
	});

	it('keeps the current assignee and every Group whatever the filter says', () => {
		const options: DutyPickerOption[] = [
			person('hale', 'SSG', 'Medic', '68W', true),
			person('liang', 'SPC', 'Driver', '88M'),
			{ kind: 'group', id: 'alpha', label: 'Alpha', current: false }
		];

		expect(ids(applyDutyFilter(options, filter({ rank: ['SPC'] })))).toEqual(['hale', 'liang', 'alpha']);
	});

	it('ignores selected values that no option has, so a stale selection hides no one', () => {
		expect(ids(applyDutyFilter(roster, filter({ rank: ['CPT'] })))).toEqual(ids(roster));
		expect(ids(applyDutyFilter(roster, filter({ rank: ['CPT', 'SSG'] })))).toEqual(['hale']);
	});

	it('matches trimmed values', () => {
		expect(ids(applyDutyFilter([person('a', 'SPC', ' Medic ', '68W')], filter({ role: ['Medic'] })))).toEqual(['a']);
	});
});
