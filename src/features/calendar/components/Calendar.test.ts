// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
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
const assignmentTypes: AssignmentType[] = [];
const assignments: DailyAssignment[] = [];

function renderCalendar() {
	return render(Calendar, {
		props: {
			year: 2026,
			monthName: 'March',
			dates: [new Date(2026, 2, 1), new Date(2026, 2, 2)],
			personnelByGroup: [{ group: 'Alpha', personnel }],
			availabilityEntries: [],
			statusTypes,
			specialDays,
			pinnedGroups: [],
			assignmentTypes,
			assignments,
			onPrevMonth: () => {},
			onNextMonth: () => {},
			onGoToToday: () => {}
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
});
