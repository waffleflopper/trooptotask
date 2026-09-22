import { afterEach, describe, expect, it } from 'vitest';
import type { AssignmentType, DailyAssignment } from '$lib/types';
import type { CalendarRangeData } from '$lib/server/core/useCases/calendarQuery';
import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
import { availabilityStore } from '$features/calendar/stores/availability.svelte';
import { specialDaysStore } from '$features/calendar/stores/specialDays.svelte';
import { CalendarRangeCoordinator } from '$features/calendar/contexts/CalendarRangeCoordinator.svelte';
import { mergeCalendarRangeIntoStores } from './calendarRangeLoader';

const types: AssignmentType[] = [
	{
		id: 'person-type',
		name: 'Staff Duty',
		shortName: 'SD',
		assignTo: 'personnel',
		color: '#123456',
		exemptPersonnelIds: [],
		showInDateHeader: false
	},
	{
		id: 'group-type',
		name: 'Detail',
		shortName: 'DT',
		assignTo: 'group',
		color: '#654321',
		exemptPersonnelIds: [],
		showInDateHeader: true
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
		mergeCalendarRangeIntoStores('org-a', rangeData([{ ...linked, assigneeId: 'p-bravo' }, group]));
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
		coordinator.includeBootstrap({ rangeStart: '2026-04-01', rangeEnd: '2026-04-30' });
		const pending = coordinator.loadVisibleRange({
			orgId: 'org-a',
			canViewCalendar: true,
			currentDate: new Date(2026, 2, 1),
			viewMode: 'month'
		});
		coordinator.reset();
		const newOrgSlot = { id: 'org-b-slot', date: '2026-03-15', assignmentTypeId: 'b-type', assigneeId: 'b-person' };
		const newOrgType = { ...types[0], id: 'b-type' };
		dailyAssignmentsStore.load([newOrgType], [newOrgSlot], 'org-b');
		coordinator.includeBootstrap({ rangeStart: '2026-03-01', rangeEnd: '2026-03-31' });
		finishOldRequest(rangeData([linked, group]));
		await pending;
		expect(dailyAssignmentsStore.orgId).toBe('org-b');
		expect(dailyAssignmentsStore.assignments).toEqual([newOrgSlot]);
		expect(dailyAssignmentsStore.types).toEqual([newOrgType]);
		expect(coordinator.loadedRange).toEqual({ rangeStart: '2026-03-01', rangeEnd: '2026-03-31' });
	});
});
