import { describe, expect, it } from 'vitest';
import type { AssignmentType, DailyAssignment } from '$lib/types';
import { createDefaultHydrationPlanner } from './hydrationPlanner';

const assignmentTypes: AssignmentType[] = [
	{
		id: 'at1',
		name: 'Staff Duty',
		shortName: 'SD',
		assignTo: 'personnel',
		color: '#111111',
		exemptPersonnelIds: [],
		showInDateHeader: false
	}
];

describe('createDefaultHydrationPlanner', () => {
	it('reuses the same calendar assignment snapshot key when the deferred assignment input is unchanged', () => {
		const planner = createDefaultHydrationPlanner('org-1');
		const deferredAssignments = Promise.resolve([
			{
				id: 'da1',
				date: '2024-01-01',
				assignmentTypeId: 'at1',
				assigneeId: 'p1'
			} satisfies DailyAssignment
		]);

		const firstPlan = planner.createPlan('calendar', {
			assignmentTypes,
			dailyAssignments: deferredAssignments
		});
		const secondPlan = planner.createPlan('calendar', {
			assignmentTypes,
			dailyAssignments: deferredAssignments
		});

		expect(firstPlan?.calendarAssignments?.deferred).toBe(true);
		expect(firstPlan?.calendarAssignments?.snapshotKey).toBe(secondPlan?.calendarAssignments?.snapshotKey);
	});

	it('reuses the same dashboard assignment snapshot key when the deferred assignment input is unchanged', () => {
		const planner = createDefaultHydrationPlanner('org-1');
		const deferredAssignments = Promise.resolve([
			{
				id: 'da1',
				date: '2024-01-01',
				assignmentTypeId: 'at1',
				assigneeId: 'p1'
			} satisfies DailyAssignment
		]);

		const firstPlan = planner.createPlan('dashboard', {
			assignmentTypes,
			todayAssignments: deferredAssignments
		});
		const secondPlan = planner.createPlan('dashboard', {
			assignmentTypes,
			todayAssignments: deferredAssignments
		});

		expect(firstPlan?.calendarAssignments?.deferred).toBe(true);
		expect(firstPlan?.calendarAssignments?.snapshotKey).toBe(secondPlan?.calendarAssignments?.snapshotKey);
	});
});
