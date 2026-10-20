import { afterEach, describe, expect, it } from 'vitest';
import type { AssignmentType, DailyAssignment } from '$features/calendar/contracts';
import type { CalendarRangeData } from '$features/calendar/calendar.types';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
import { beginCalendarRangeRead, mergeCalendarRangeIntoStores } from './calendarRangeLoader';

const types: AssignmentType[] = [
	{
		id: 'person-type',
		name: 'Staff Duty',
		shortName: 'SD',
		assignTo: 'personnel',
		color: '#123456',
		exemptPersonnelIds: [],
		showOnCalendar: false,
		sortOrder: 0
	},
	{
		id: 'group-type',
		name: 'Detail',
		shortName: 'DT',
		assignTo: 'group',
		color: '#654321',
		exemptPersonnelIds: [],
		showOnCalendar: true,
		sortOrder: 1
	}
];
const linked: DailyAssignment = {
	id: 'linked',
	date: '2026-03-15',
	assignmentTypeId: 'person-type',
	assigneeId: 'p-alpha'
};
const group: DailyAssignment = {
	id: 'manual-group',
	date: '2026-03-01',
	assignmentTypeId: 'group-type',
	assigneeId: 'g-bravo'
};
const outside: DailyAssignment = {
	id: 'outside-window',
	date: '2026-04-01',
	assignmentTypeId: 'person-type',
	assigneeId: 'p-alpha'
};

function rangeData(dailyAssignments: DailyAssignment[]): CalendarRangeData {
	return {
		rangeStart: '2026-03-01',
		rangeEnd: '2026-03-31',
		dailyAssignments,
		availabilityEntries: [],
		specialDays: []
	};
}

afterEach(() => {
	dailyAssignmentsStore.load([], [], '');
	availabilityStore.load([], '');
	specialDaysStore.load([], '');
});

describe('Calendar persisted range preservation', () => {
	it('refreshes edited linked facts, removes stale in-range rows, and retains Group slots, outside rows and types', () => {
		dailyAssignmentsStore.load(
			types,
			[
				linked,
				group,
				outside,
				{ id: 'deleted', date: '2026-03-31', assignmentTypeId: 'group-type', assigneeId: 'g-alpha' }
			],
			'org-a'
		);
		mergeCalendarRangeIntoStores(
			'org-a',
			rangeData([{ ...linked, assigneeId: 'p-bravo' }, group]),
			beginCalendarRangeRead()
		);
		expect(dailyAssignmentsStore.assignments).toEqual([
			outside,
			{
				id: 'linked',
				date: '2026-03-15',
				assignmentTypeId: 'person-type',
				assigneeId: 'p-bravo'
			},
			group
		]);
		expect(dailyAssignmentsStore.types).toEqual(types);
	});

	it('a late response from the previous Organization cannot replace the new Organization saved facts', async () => {
		let finishOldRequest!: (data: CalendarRangeData) => void;
		const coordinator = new CalendarRangeCoordinator({
			loadRange: () =>
				new Promise((resolve) => {
					finishOldRequest = resolve;
				})
		});
		dailyAssignmentsStore.load(types, [outside], 'org-a');
		const april = { rangeStart: '2026-04-01', rangeEnd: '2026-04-30' };
		const march = { rangeStart: '2026-03-01', rangeEnd: '2026-03-31' };
		coordinator.includeBootstrap({ ...april, availabilityRange: april });
		const pending = coordinator.ensureRange('org-a', { assignments: march });
		coordinator.reset();
		const newOrgSlot = { id: 'org-b-slot', date: '2026-03-15', assignmentTypeId: 'b-type', assigneeId: 'b-person' };
		const newOrgType = { ...types[0], id: 'b-type' };
		dailyAssignmentsStore.load([newOrgType], [newOrgSlot], 'org-b');
		coordinator.includeBootstrap({ ...march, availabilityRange: march });
		finishOldRequest(rangeData([linked, group]));
		await pending;
		expect(dailyAssignmentsStore.orgId).toBe('org-b');
		expect(dailyAssignmentsStore.assignments).toEqual([newOrgSlot]);
		expect(dailyAssignmentsStore.types).toEqual([newOrgType]);
		expect(coordinator.loaded).toEqual({ availability: march, assignments: march });
	});
});
