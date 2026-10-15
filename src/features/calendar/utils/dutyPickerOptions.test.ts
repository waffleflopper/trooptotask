import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry } from '$features/calendar/contracts';
import type { Personnel } from '$features/personnel/contracts';
import { dutyPickerOptions, type DutyPickerInput } from './dutyPickerOptions';

const staffDuty: AssignmentType = {
	id: 'sd',
	name: 'Staff Duty',
	shortName: 'SD',
	assignTo: 'personnel',
	color: '#b91c1c',
	exemptPersonnelIds: ['p-kim'],
	showOnCalendar: true,
	sortOrder: 0
};

function person(id: string, rank: string, lastName: string, firstName: string): Personnel {
	return { id, rank, lastName, firstName, mos: '', clinicRole: '', groupId: null, groupName: '' };
}

function leave(personnelId: string, startDate: string, endDate: string): AvailabilityEntry {
	return { id: `${personnelId}-${startDate}`, personnelId, statusTypeId: 'leave', startDate, endDate };
}

function options(overrides: Partial<DutyPickerInput> = {}) {
	return dutyPickerOptions({
		type: staffDuty,
		dateKey: '2026-10-27',
		personnel: [
			person('p-ortiz-b', 'SPC', 'Ortiz', 'Lucia'),
			person('p-kim', 'SGT', 'Kim', 'Jae-won'),
			person('p-ortiz-a', 'PFC', 'Ortiz', 'Lucia'),
			person('p-reed', 'PV2', 'Reed', 'Sam'),
			person('p-hale', 'SSG', 'Hale', 'Corey'),
			person('p-ortiz-c', 'SGT', 'Ortiz', 'Ana'),
			person('p-liang', 'SPC', 'Liang', 'Wei')
		],
		groups: [],
		availabilityEntries: [
			leave('p-liang', '2026-10-26', '2026-11-03'),
			leave('p-liang', '2026-10-27', '2026-10-27'),
			leave('p-hale', '2026-10-20', '2026-10-26'),
			leave('p-ortiz-a', '2026-10-28', '2026-10-30'),
			leave('p-ortiz-b', '2026-10-25', '2026-10-27'),
			leave('p-reed', '2026-10-27', '2026-10-29')
		],
		statusTypes: [{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#fff' }],
		currentAssigneeId: 'p-hale',
		...overrides
	});
}

describe('dutyPickerOptions', () => {
	it('omits exempt people, sorts by name with a stable tie-break, and marks who is unavailable that day', () => {
		const result = options();

		expect(
			result.map((option) => [option.id, option.prefix, option.label, option.current, !!option.unavailable])
		).toEqual([
			['p-hale', 'SSG', 'Hale, Corey', true, false],
			['p-liang', 'SPC', 'Liang, Wei', false, true],
			['p-ortiz-c', 'SGT', 'Ortiz, Ana', false, false],
			['p-ortiz-a', 'PFC', 'Ortiz, Lucia', false, false],
			['p-ortiz-b', 'SPC', 'Ortiz, Lucia', false, true],
			['p-reed', 'PV2', 'Reed, Sam', false, true]
		]);
		const liang = result.find((option) => option.id === 'p-liang')?.unavailable;
		expect(liang).toMatch(/Leave 26 Oct\b.*3 Nov/);
		expect(liang).toMatch(/Leave 27 Oct\b/);
	});

	it('lists Groups by name for a Group duty without exemptions or availability', () => {
		const result = options({
			type: { ...staffDuty, assignTo: 'group', exemptPersonnelIds: ['g-b'] },
			groups: [
				{ id: 'g-b', name: 'Bravo', sortOrder: 0 },
				{ id: 'g-a', name: 'Alpha', sortOrder: 1 }
			],
			currentAssigneeId: 'g-b'
		});

		expect(result).toEqual([
			{ id: 'g-a', label: 'Alpha', current: false },
			{ id: 'g-b', label: 'Bravo', current: true }
		]);
	});
});
