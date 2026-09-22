// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Calendar from './Calendar.svelte';
import type { Personnel, StatusType, SpecialDay, AssignmentType, DailyAssignment } from '$lib/types';
import type { UpcomingLossRecord } from '$lib/domain/readinessSignals';

let resizeObserverCallback: ResizeObserverCallback | undefined;
const resizeObserve = vi.fn();
const resizeDisconnect = vi.fn();

class MockResizeObserver {
	constructor(callback: ResizeObserverCallback) {
		resizeObserverCallback = callback;
	}

	observe = resizeObserve;
	disconnect = resizeDisconnect;
	unobserve = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

function triggerResizeObserver() {
	if (!resizeObserverCallback) {
		throw new Error('ResizeObserver callback was not registered');
	}

	resizeObserverCallback([], {} as ResizeObserver);
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	resizeObserverCallback = undefined;
});

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

function makePersonnel(count: number, overrides: Partial<Personnel> = {}): Personnel[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `person-${index + 1}`,
		firstName: `First ${index + 1}`,
		lastName: `Person ${String(index + 1).padStart(3, '0')}`,
		rank: 'SGT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B',
		...overrides
	}));
}

function renderCalendar(
	overrides: Partial<{
		personnelByGroup: { group: string; personnel: Personnel[] }[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		showPersonnelRoles: boolean;
		canEdit: boolean;
		canEditAssignments: boolean;
		onDateClick: (date: Date) => void;
		onNavigateToMonth: (year: number, month: number) => void;
		upcomingLossMap: Map<string, UpcomingLossRecord>;
	}> = {}
) {
	return render(Calendar, {
		props: {
			year: 2026,
			month: 2,
			monthName: 'March',
			dates: [new Date(2026, 2, 1), new Date(2026, 2, 2)],
			personnelByGroup: overrides.personnelByGroup ?? [{ group: 'Alpha', personnel }],
			availabilityEntries: [],
			statusTypes,
			specialDays,
			pinnedGroups: [],
			assignmentTypes: overrides.assignmentTypes ?? [],
			assignments: overrides.assignments ?? [],
			showPersonnelRoles: overrides.showPersonnelRoles ?? false,
			canEdit: overrides.canEdit,
			canEditAssignments: overrides.canEditAssignments,
			onDateClick: overrides.onDateClick,
			onPrevMonth: () => {},
			onNextMonth: () => {},
			onGoToToday: () => {},
			onNavigateToMonth: overrides.onNavigateToMonth,
			upcomingLossMap: overrides.upcomingLossMap
		}
	});
}

function makeLossRecord(personId: string, triggerType: UpcomingLossRecord['triggerType']): UpcomingLossRecord {
	return {
		id: personId,
		personId,
		personName: `SGT Smith`,
		rank: 'SGT',
		lastName: 'Smith',
		triggerType,
		targetDate: '2026-07-01',
		daysRemaining: 78,
		awardDueSoon: true,
		awardTrackingAcknowledged: false,
		groupId: 'group-1'
	};
}

describe('Calendar', () => {
	it('keeps date headers editable for Daily Assignment managers without availability access', async () => {
		const onDateClick = vi.fn();
		const { container } = renderCalendar({ canEdit: false, canEditAssignments: true, onDateClick });
		const dateHeaderButtons = container.querySelectorAll('.date-headers button');

		await fireEvent.click(dateHeaderButtons[1]!);

		expect(onDateClick).toHaveBeenCalledTimes(1);
		expect(onDateClick.mock.calls[0]?.[0]).toBeInstanceOf(Date);
	});

	it('hides personnel roles and compacts virtualized rows when role display is disabled', () => {
		const { container, queryByText } = renderCalendar({ showPersonnelRoles: false });
		const calendarBody = container.querySelector('.calendar-body') as HTMLDivElement | null;

		expect(queryByText('Medic')).toBeNull();
		expect(calendarBody?.style.getPropertyValue('--calendar-person-row-height')).toBe('36px');
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

	it('mounts a scrolling window of personnel rows for large rosters', async () => {
		const largeRoster = makePersonnel(120, { clinicRole: 'Role text that would otherwise add a second line' });
		const { container } = renderCalendar({
			personnelByGroup: [{ group: 'Alpha', personnel: largeRoster }],
			showPersonnelRoles: true
		});

		const calendarBody = container.querySelector('.calendar-body') as HTMLDivElement | null;
		const firstPersonVirtualRow = container.querySelector('.virtual-row:nth-child(2)') as HTMLElement | null;
		expect(calendarBody).toBeTruthy();
		expect(firstPersonVirtualRow?.style.height).toBe('46px');
		expect(firstPersonVirtualRow?.classList.contains('virtual-row--person')).toBe(true);
		expect(calendarBody?.style.getPropertyValue('--calendar-person-row-height')).toBe('46px');
		expect(container.querySelectorAll('.personnel-row').length).toBeLessThan(largeRoster.length);
		expect(container.textContent).toContain('Person 001');

		if (!calendarBody) {
			throw new Error('Calendar body was not rendered');
		}

		Object.defineProperty(calendarBody, 'clientHeight', {
			configurable: true,
			value: 260
		});
		Object.defineProperty(calendarBody, 'offsetWidth', {
			configurable: true,
			value: 800
		});
		Object.defineProperty(calendarBody, 'scrollTop', {
			configurable: true,
			writable: true,
			value: 10_000
		});
		Object.defineProperty(calendarBody, 'scrollLeft', {
			configurable: true,
			writable: true,
			value: 0
		});

		await fireEvent.scroll(calendarBody);
		await tick();

		expect(container.textContent).not.toContain('Person 001');
		expect(container.textContent).toContain('Person 120');
		expect(container.querySelectorAll('.personnel-row').length).toBeLessThan(largeRoster.length);
	});

	it('refreshes virtual rows when the calendar body resizes without scrolling', async () => {
		const largeRoster = makePersonnel(120);
		const { container } = renderCalendar({
			personnelByGroup: [{ group: 'Alpha', personnel: largeRoster }]
		});

		const calendarBody = container.querySelector('.calendar-body') as HTMLDivElement | null;
		expect(calendarBody).toBeTruthy();

		if (!calendarBody) {
			throw new Error('Calendar body was not rendered');
		}

		Object.defineProperty(calendarBody, 'scrollTop', {
			configurable: true,
			writable: true,
			value: 0
		});
		Object.defineProperty(calendarBody, 'scrollLeft', {
			configurable: true,
			writable: true,
			value: 0
		});
		Object.defineProperty(calendarBody, 'clientHeight', {
			configurable: true,
			value: 260
		});

		triggerResizeObserver();
		await tick();

		expect(container.textContent).not.toContain('Person 040');

		Object.defineProperty(calendarBody, 'clientHeight', {
			configurable: true,
			value: 2000
		});

		triggerResizeObserver();
		await tick();

		expect(container.textContent).toContain('Person 040');
	});

	// ---- Upcoming-loss indicators ------------------------------------------

	describe('upcoming-loss indicators', () => {
		it('renders a loss indicator chip in the row header for a person in the loss map', () => {
			const lossMap = new Map([['person-1', makeLossRecord('person-1', 'ETS')]]);
			const { container } = renderCalendar({ upcomingLossMap: lossMap });

			// Chip must exist for person-1
			const chip = container.querySelector('[data-testid="loss-indicator-person-1"]');
			expect(chip).toBeTruthy();
		});

		it('shows the correct trigger type text in the chip', () => {
			const lossMap = new Map([['person-1', makeLossRecord('person-1', 'ETS')]]);
			const { container } = renderCalendar({ upcomingLossMap: lossMap });

			const chip = container.querySelector('[data-testid="loss-indicator-person-1"]') as HTMLElement | null;
			expect(chip?.textContent?.trim()).toBe('ETS');
		});

		it('shows PCS label for a DEROS-triggered record', () => {
			const lossMap = new Map([['person-1', makeLossRecord('person-1', 'PCS / DEROS')]]);
			const { container } = renderCalendar({ upcomingLossMap: lossMap });

			const chip = container.querySelector('[data-testid="loss-indicator-person-1"]') as HTMLElement | null;
			expect(chip?.textContent?.trim()).toBe('PCS');
		});

		it('does not render a chip for a person not in the loss map', () => {
			// Empty map — neither person has an upcoming loss
			const { container } = renderCalendar({ upcomingLossMap: new Map() });

			expect(container.querySelector('[data-testid="loss-indicator-person-1"]')).toBeNull();
			expect(container.querySelector('[data-testid="loss-indicator-person-2"]')).toBeNull();
		});

		it('does not render a chip at all when no loss map is provided', () => {
			// No upcomingLossMap prop at all
			const { container } = renderCalendar();

			expect(container.querySelector('[data-testid^="loss-indicator-"]')).toBeNull();
		});

		it('places the chip inside the personnel-info header, not inside a date cell', () => {
			const lossMap = new Map([['person-1', makeLossRecord('person-1', 'ETS')]]);
			const { container } = renderCalendar({ upcomingLossMap: lossMap });

			const chip = container.querySelector('[data-testid="loss-indicator-person-1"]') as HTMLElement | null;
			expect(chip).toBeTruthy();

			// Must be a descendant of .personnel-info (the sticky row header)
			expect(chip?.closest('.personnel-info')).toBeTruthy();

			// Must NOT be inside any .date-cell element
			expect(chip?.closest('.date-cell')).toBeNull();
		});

		it('only shows chips for personnel that have a loss record, leaving others clean', () => {
			// Only person-1 is in the map; person-2 must not get a chip
			const lossMap = new Map([['person-1', makeLossRecord('person-1', 'ETS')]]);
			const { container } = renderCalendar({ upcomingLossMap: lossMap });

			expect(container.querySelector('[data-testid="loss-indicator-person-1"]')).toBeTruthy();
			expect(container.querySelector('[data-testid="loss-indicator-person-2"]')).toBeNull();
		});
	});
});
