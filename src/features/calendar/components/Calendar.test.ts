// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Calendar from './Calendar.svelte';
import type { Personnel, StatusType, SpecialDay, AssignmentType, DailyAssignment } from '$lib/types';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

afterEach(cleanup);

const personnel: Personnel[] = [
	{
		id: 'person-1',
		firstName: 'Alex',
		lastName: 'Smith',
		rank: 'SGT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B'
	},
	{
		id: 'person-2',
		firstName: 'Jamie',
		lastName: 'Taylor',
		rank: 'SSG',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: 'Medic',
		mos: '68W'
	}
];

const statusTypes: StatusType[] = [];
const specialDays: SpecialDay[] = [];

function renderCalendar(
	overrides: Partial<{
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		dutyEvents: DutyEvent[];
		onNavigateToMonth: (year: number, month: number) => void;
	}> = {}
) {
	return render(Calendar, {
		props: {
			year: 2026,
			month: 2,
			monthName: 'March',
			dates: [new Date(2026, 2, 1), new Date(2026, 2, 2)],
			personnelByGroup: [{ group: 'Alpha', personnel }],
			availabilityEntries: [],
			statusTypes,
			specialDays,
			pinnedGroups: [],
			assignmentTypes: overrides.assignmentTypes ?? [],
			assignments: overrides.assignments ?? [],
			dutyEvents: overrides.dutyEvents ?? [],
			onPrevMonth: () => {},
			onNextMonth: () => {},
			onGoToToday: () => {},
			onNavigateToMonth: overrides.onNavigateToMonth
		}
	});
}

function makeDutyEvent(eventDate: string, assigneeId: string, templateName = 'Battalion Staff Duty'): DutyEvent {
	return {
		id: `evt-${eventDate}-${assigneeId}`,
		orgId: 'org-1',
		runId: null,
		templateId: 'tpl-1',
		templateName,
		eventDate,
		coverageMode: 'timed',
		coverageStart: `${eventDate}T08:00:00`,
		coverageEnd: `${eventDate}T20:00:00`,
		isBlocking: true,
		cooldownHours: 12,
		rulesSnapshot: {
			templateId: 'tpl-1',
			templateName,
			templateStatus: 'active',
			coverageMode: 'timed',
			startTime: '08:00',
			endTime: '20:00',
			scopeType: 'organization',
			scopeGroupIds: [],
			isBlocking: true,
			cooldownHours: 12,
			slots: []
		},
		fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
		collisionSummary: { hasConflicts: false, conflicts: [] },
		originalProposal: null,
		createdAt: '2026-02-01T12:00:00Z',
		updatedAt: '2026-02-01T12:00:00Z',
		slotInstances: [
			{
				id: `slot-${eventDate}-${assigneeId}`,
				dutyEventId: `evt-${eventDate}-${assigneeId}`,
				templateSlotId: 'tslot-1',
				roleLabel: 'NCO',
				slotIndex: 0,
				assigneeId,
				assignmentSource: 'generated',
				warningState: 'none',
				fairnessConfidence: 'high',
				selectionReason: null,
				unfilledReason: null,
				sortOrder: 0
			}
		]
	};
}

describe('Calendar', () => {
	it('keeps header scroll synced without restoring the old scroll-left CSS variable', async () => {
		const { container } = renderCalendar();
		const calendarBody = container.querySelector('.calendar-body') as HTMLDivElement | null;
		const dateHeaders = container.querySelector('.date-headers') as HTMLDivElement | null;
		expect(calendarBody).toBeTruthy();
		expect(dateHeaders).toBeTruthy();

		const style = calendarBody?.getAttribute('style') || '';
		expect(style).not.toContain('--scroll-left');

		if (!calendarBody || !dateHeaders) {
			throw new Error('Calendar elements not rendered');
		}

		Object.defineProperty(calendarBody, 'scrollLeft', {
			configurable: true,
			writable: true,
			value: 48
		});
		Object.defineProperty(calendarBody, 'offsetWidth', {
			configurable: true,
			value: 320
		});
		Object.defineProperty(calendarBody, 'clientWidth', {
			configurable: true,
			value: 304
		});

		await fireEvent.scroll(calendarBody);
		await tick();

		expect(calendarBody.style.getPropertyValue('--scroll-left')).toBe('');
		expect(dateHeaders.scrollLeft).toBe(48);
		expect(dateHeaders.style.paddingRight).toBe('16px');
	});

	it('renders the month grid with a shared content wrapper and direct date-cell siblings', () => {
		const { container } = renderCalendar();
		const calendarGrid = container.querySelector('.calendar-grid');
		const firstRow = container.querySelector('.personnel-row') as HTMLElement | null;
		const firstPersonnelCell = container.querySelector('.personnel-info') as HTMLElement | null;

		expect(calendarGrid).toBeTruthy();
		expect(firstRow).toBeTruthy();
		expect(firstPersonnelCell).toBeTruthy();

		if (!firstRow || !firstPersonnelCell) {
			throw new Error('Calendar rows not rendered');
		}

		expect(firstRow.querySelector('.date-cells')).toBeNull();
		expect(firstRow.children[0]).toBe(firstPersonnelCell);
		expect(firstRow.querySelectorAll(':scope > .date-cell')).toHaveLength(2);
	});

	it('shows a readable personnel label in the header badge when the selected header type is person-based', () => {
		const { container } = renderCalendar({
			assignmentTypes: [
				{
					id: 'type-mod',
					name: 'Manager on Duty',
					shortName: 'MOD',
					assignTo: 'personnel',
					color: '#dc2626',
					exemptPersonnelIds: [],
					showInDateHeader: true
				}
			],
			assignments: [
				{
					id: 'assignment-1',
					date: '2026-03-01',
					assignmentTypeId: 'type-mod',
					assigneeId: 'person-1'
				}
			]
		});

		const badge = container.querySelector('.header-assignment-badge') as HTMLElement | null;
		expect(badge).toBeTruthy();

		if (!badge) {
			throw new Error('Header badge not rendered');
		}

		expect(badge.textContent?.trim()).toBe('SGT Smith');
		expect(badge.title).toBe('Manager on Duty: SGT Smith');
	});

	it('renders advanced duty events as inline badges in the assignee cell without extra rows', () => {
		const { container } = renderCalendar({
			dutyEvents: [makeDutyEvent('2026-03-02', 'person-2', 'Battalion Staff Duty')]
		});

		// Should still only render two personnel rows — no new rows added for duty events.
		expect(container.querySelectorAll('.personnel-row')).toHaveLength(2);

		const dutyBadges = container.querySelectorAll('.assignment-badge.duty-badge');
		expect(dutyBadges).toHaveLength(1);
		expect(dutyBadges[0].textContent?.trim()).toBe('BSD');

		// Tooltip should describe the template and role.
		const cellWithBadge = dutyBadges[0].closest('.date-cell') as HTMLElement | null;
		expect(cellWithBadge?.title).toContain('Battalion Staff Duty — NCO');
	});

	it('does not render duty badges on cells where the person is not assigned', () => {
		const { container } = renderCalendar({
			dutyEvents: [makeDutyEvent('2026-03-01', 'person-1')]
		});
		// Only one badge total — on person-1's 2026-03-01 cell.
		expect(container.querySelectorAll('.assignment-badge.duty-badge')).toHaveLength(1);
	});

	it('opens the month picker from the title and forwards the selected month and year', async () => {
		const onNavigateToMonth = vi.fn();
		const { container, getByTestId, getByRole, queryByRole } = renderCalendar({ onNavigateToMonth });

		await fireEvent.click(getByTestId('calendar-month-label'));

		expect(getByRole('dialog', { name: 'Month and year picker' })).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'Next year' }));
		await fireEvent.click(getByRole('button', { name: 'Jan' }));
		await tick();

		expect(onNavigateToMonth).toHaveBeenCalledWith(2027, 0);
		expect(queryByRole('dialog', { name: 'Month and year picker' })).toBeNull();
		expect(container.querySelector('.month-picker-popover')).toBeNull();
	});
});
