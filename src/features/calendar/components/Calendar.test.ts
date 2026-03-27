// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Calendar from './Calendar.svelte';
import type { Personnel, StatusType, SpecialDay, AssignmentType, DailyAssignment } from '$lib/types';

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
			onPrevMonth: () => {},
			onNextMonth: () => {},
			onGoToToday: () => {},
			onNavigateToMonth: overrides.onNavigateToMonth
		}
	});
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
