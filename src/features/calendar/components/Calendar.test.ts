// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
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
	it('does not set --scroll-left CSS custom property on initial render', () => {
		const { container } = renderCalendar();
		const calendarBody = container.querySelector('.calendar-body');
		expect(calendarBody).toBeTruthy();
		const style = calendarBody?.getAttribute('style') || '';
		expect(style).not.toContain('--scroll-left');
	});
});
