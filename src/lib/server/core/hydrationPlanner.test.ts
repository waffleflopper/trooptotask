import { describe, expect, it } from 'vitest';
import type { AssignmentType, AvailabilityEntry, DailyAssignment, SpecialDay } from '$lib/types';
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
	it('returns undefined for non-object, array, and all-empty data', () => {
		const planner = createDefaultHydrationPlanner('org-1');

		expect(planner.createPlan('calendar', null)).toBeUndefined();
		expect(planner.createPlan('calendar', [])).toBeUndefined();
		expect(planner.createPlan('calendar', {})).toBeUndefined();
	});

	it('excludes dashboard rating scheme entries even when present', () => {
		const planner = createDefaultHydrationPlanner('org-1');

		const plan = planner.createPlan('dashboard', {
			groups: [{ id: 'group-1' }],
			ratingSchemeEntries: [{ id: 'rating-1' }]
		});

		expect(plan?.groups).toBeDefined();
		expect(plan?.ratingSchemeEntries).toBeUndefined();
	});

	it('maps dashboard today assignments to calendar assignments and ignores them elsewhere', () => {
		const planner = createDefaultHydrationPlanner('org-1');
		const todayAssignments: DailyAssignment[] = [
			{
				id: 'da1',
				date: '2024-01-01',
				assignmentTypeId: 'at1',
				assigneeId: 'p1'
			}
		];

		const dashboardPlan = planner.createPlan('dashboard', {
			assignmentTypes,
			todayAssignments
		});
		const calendarPlan = planner.createPlan('calendar', {
			assignmentTypes,
			todayAssignments
		});

		expect(dashboardPlan?.calendarAssignments?.items).toEqual({
			types: assignmentTypes,
			assignments: todayAssignments
		});
		expect(calendarPlan).toBeUndefined();
	});

	it('uses merge mode for calendar date-range hydration and replace mode elsewhere', () => {
		const planner = createDefaultHydrationPlanner('org-1');
		const availabilityEntries = [{ id: 'availability-1' }] as AvailabilityEntry[];
		const specialDays = [{ id: 'special-day-1' }] as SpecialDay[];
		const dailyAssignments = [
			{
				id: 'da1',
				date: '2024-01-01',
				assignmentTypeId: 'at1',
				assigneeId: 'p1'
			} satisfies DailyAssignment
		];

		const calendarPlan = planner.createPlan('calendar', {
			availabilityEntries,
			specialDays,
			assignmentTypes,
			dailyAssignments
		});
		const dashboardPlan = planner.createPlan('dashboard', {
			availabilityEntries,
			specialDays,
			assignmentTypes,
			todayAssignments: dailyAssignments
		});

		expect(calendarPlan?.availabilityEntries?.mode).toBe('merge');
		expect(calendarPlan?.specialDays?.mode).toBe('merge');
		expect(calendarPlan?.calendarAssignments?.mode).toBe('merge');
		expect(dashboardPlan?.availabilityEntries?.mode).toBe('replace');
		expect(dashboardPlan?.specialDays?.mode).toBe('replace');
		expect(dashboardPlan?.calendarAssignments?.mode).toBe('replace');
	});

	it('only includes personnel.all when allPersonnel is supplied', () => {
		const planner = createDefaultHydrationPlanner('org-1');
		const scopedPersonnel = [{ id: 'p1' }];
		const allPersonnel = [{ id: 'p1' }, { id: 'p2' }];

		const scopedOnlyPlan = planner.createPlan('personnel', {
			personnel: scopedPersonnel
		});
		const scopedAndAllPlan = planner.createPlan('personnel', {
			personnel: scopedPersonnel,
			allPersonnel
		});

		expect(scopedOnlyPlan?.personnel?.scoped.items).toBe(scopedPersonnel);
		expect(scopedOnlyPlan?.personnel?.all).toBeUndefined();
		expect(scopedAndAllPlan?.personnel?.scoped.items).toBe(scopedPersonnel);
		expect(scopedAndAllPlan?.personnel?.all?.items).toBe(allPersonnel);
	});

	it('builds onboarding templates from template and step arrays separately from onboardings', () => {
		const planner = createDefaultHydrationPlanner('org-1');
		const onboardingTemplates = [{ id: 'template-1' }];
		const onboardingTemplateSteps = [{ id: 'step-1', templateId: 'template-1' }];
		const onboardings = [{ id: 'onboarding-1' }];

		const plan = planner.createPlan('onboarding', {
			onboardingTemplates,
			onboardingTemplateSteps,
			onboardings
		});
		const planWithDifferentSteps = planner.createPlan('onboarding', {
			onboardingTemplates,
			onboardingTemplateSteps: [{ id: 'step-2', templateId: 'template-1' }],
			onboardings
		});

		expect(plan?.onboardingTemplates?.templates).toBe(onboardingTemplates);
		expect(plan?.onboardingTemplates?.steps).toBe(onboardingTemplateSteps);
		expect(plan?.onboardingTemplates?.snapshotKey).not.toBe(planWithDifferentSteps?.onboardingTemplates?.snapshotKey);
		expect(plan?.onboardings?.items).toBe(onboardings);
	});

	it('marks promise inputs as deferred with a stable deferred snapshot key', () => {
		const planner = createDefaultHydrationPlanner('org-1');
		const groups = Promise.resolve([{ id: 'group-1' }]);

		const firstPlan = planner.createPlan('personnel', { groups });
		const secondPlan = planner.createPlan('personnel', { groups });

		expect(firstPlan?.groups?.deferred).toBe(true);
		expect(firstPlan?.groups?.snapshotKey).toBe(secondPlan?.groups?.snapshotKey);
	});

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

	it('uses range bounds in the calendar assignment snapshot key', () => {
		const planner = createDefaultHydrationPlanner('org-1');
		const dailyAssignments: DailyAssignment[] = [
			{
				id: 'da1',
				date: '2024-01-01',
				assignmentTypeId: 'at1',
				assigneeId: 'p1'
			}
		];

		const firstPlan = planner.createPlan('calendar', {
			assignmentTypes,
			dailyAssignments,
			rangeStart: '2024-01-01',
			rangeEnd: '2024-01-31'
		});
		const secondPlan = planner.createPlan('calendar', {
			assignmentTypes,
			dailyAssignments,
			rangeStart: '2024-02-01',
			rangeEnd: '2024-02-29'
		});

		expect(firstPlan?.calendarAssignments?.snapshotKey).not.toBe(secondPlan?.calendarAssignments?.snapshotKey);
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
