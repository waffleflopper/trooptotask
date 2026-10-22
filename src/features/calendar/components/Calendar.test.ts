// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import Calendar from './Calendar.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type {
	AvailabilityEntry,
	StatusType,
	SpecialDay,
	AssignmentType,
	DailyAssignment
} from '$features/calendar/contracts';
import type { UpcomingLossRecord } from '$features/personnel/contracts';
import { buildAvailabilityTracks } from '$features/calendar/utils/availabilityTracks';
import { buildCalendarLanes, spanTrack, type CalendarLane } from '$features/calendar/utils/calendarLanes';
import FixtureLaneSegment from '$features/calendar/test-support/FixtureLaneSegment.svelte';

const resizeObserve = vi.fn();
const resizeDisconnect = vi.fn();

class MockResizeObserver {
	observe = resizeObserve;
	disconnect = resizeDisconnect;
	unobserve = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
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

const statusTypes: StatusType[] = [
	{ id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', shortLabel: 'LV', sortOrder: 0 }
];
const smithOnLeave: AvailabilityEntry = {
	id: 'entry-1',
	personnelId: 'person-1',
	statusTypeId: 'leave',
	startDate: '2026-03-01',
	endDate: '2026-03-02',
	note: 'Block leave'
};
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
		availabilityEntries: AvailabilityEntry[];
		onOpenEntry: (person: Personnel, entry: AvailabilityEntry, anchor: HTMLElement) => void;
		onOpenOverflow: (person: Personnel, entryIds: readonly string[], anchor: HTMLElement) => void;
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		lanes: CalendarLane[];
		specialDays: SpecialDay[];
		onMarkerClick: (date: Date) => void;
		showPersonnelRoles: boolean;
		canEdit: boolean;
		canEditAssignments: boolean;
		onDateClick: (date: Date) => void;
		onCellClick: (person: Personnel, date: Date) => void;
		onPersonClick: (person: Personnel) => void;
		upcomingLossMap: Map<string, UpcomingLossRecord>;
		canEditAvailabilityFor: (person: Personnel) => boolean;
		popoverEntry: { personId: string; entryId: string } | null;
		saving: boolean;
		onQuickAdd: (person: Personnel, startDate: string, endDate: string, anchor: HTMLElement) => void;
		onResize: (person: Personnel, entry: AvailabilityEntry, startDate: string, endDate: string) => void;
	}> = {}
) {
	return render(Calendar, {
		props: {
			dates: [new Date(2026, 2, 1), new Date(2026, 2, 2)],
			personnelByGroup: overrides.personnelByGroup ?? [{ group: 'Alpha', personnel }],
			tracks: buildAvailabilityTracks(overrides.availabilityEntries ?? [], statusTypes),
			specialDays: overrides.specialDays ?? specialDays,
			pinnedGroups: [],
			assignmentTypes: overrides.assignmentTypes ?? [],
			assignments: overrides.assignments ?? [],
			lanes: overrides.lanes,
			onMarkerClick: overrides.onMarkerClick,
			showPersonnelRoles: overrides.showPersonnelRoles ?? false,
			canEdit: overrides.canEdit,
			canEditAssignments: overrides.canEditAssignments,
			onDateClick: overrides.onDateClick,
			onCellClick: overrides.onCellClick,
			onPersonClick: overrides.onPersonClick,
			onOpenEntry: overrides.onOpenEntry,
			onOpenOverflow: overrides.onOpenOverflow,
			upcomingLossMap: overrides.upcomingLossMap,
			canEditAvailabilityFor: overrides.canEditAvailabilityFor,
			popoverEntry: overrides.popoverEntry,
			saving: overrides.saving,
			onQuickAdd: overrides.onQuickAdd,
			onResize: overrides.onResize
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

	it('names each day cell with its Person and date and describes its assignment', async () => {
		const onCellClick = vi.fn();
		renderCalendar({
			onCellClick,
			assignmentTypes: [
				{
					id: 'type-mod',
					name: 'Manager on Duty',
					shortName: 'MOD',
					assignTo: 'personnel',
					color: '#dc2626',
					exemptPersonnelIds: [],
					showOnCalendar: false,
					sortOrder: 0
				}
			],
			assignments: [{ id: 'assignment-1', date: '2026-03-01', assignmentTypeId: 'type-mod', assigneeId: 'person-1' }]
		});

		const assigned = screen.getByRole('button', {
			name: 'SGT Smith, Alex, Sunday, March 1, 2026',
			description: 'Manager on Duty'
		});
		expect(screen.getByRole('button', { name: 'SSG Taylor, Jamie, Monday, March 2, 2026' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Sunday, March 1, 2026' })).toBeTruthy();

		await fireEvent.click(assigned);
		expect(onCellClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'person-1' }), new Date(2026, 2, 1));
	});

	it('draws each entry as one bar named by its Person, status, dates and note', async () => {
		const onOpenEntry = vi.fn();
		const onCellClick = vi.fn();
		renderCalendar({ availabilityEntries: [smithOnLeave], onOpenEntry, onCellClick });

		await fireEvent.click(
			screen.getByRole('button', { name: 'SGT Smith, Alex, Leave, 1 to 2 March 2026, 2 days, Block leave' })
		);

		expect(onOpenEntry).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'person-1' }),
			smithOnLeave,
			expect.any(HTMLElement)
		);
		expect(onCellClick).not.toHaveBeenCalled();
	});

	it('summarizes entries past the second lane in one button that opens them', async () => {
		const onOpenOverflow = vi.fn();
		renderCalendar({
			availabilityEntries: [
				smithOnLeave,
				{ ...smithOnLeave, id: 'entry-2', note: null },
				{ ...smithOnLeave, id: 'entry-3', startDate: '2026-03-02', note: null }
			],
			onOpenOverflow
		});

		await fireEvent.click(screen.getByRole('button', { name: 'SGT Smith, Alex, 2 more entries, 1 to 2 March 2026' }));

		expect(onOpenOverflow).toHaveBeenCalledWith(
			expect.objectContaining({ id: 'person-1' }),
			['entry-2', 'entry-3'],
			expect.any(HTMLElement)
		);
	});

	it('counts the people out each day while their group is collapsed', async () => {
		const outOn = (date: string) => {
			const text = screen.queryByText(new RegExp(date))?.textContent;
			return text ? Number(text.replace(date, '').match(/\d+/)?.[0]) : null;
		};
		renderCalendar({ availabilityEntries: [{ ...smithOnLeave, endDate: '2026-03-01' }] });
		expect(outOn('March 1, 2026')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: /Alpha/ }));

		expect(outOn('March 1, 2026')).toBe(1);
		expect(outOn('March 2, 2026')).toBeNull();
	});

	it('offers resize grips only on the bars of people the member may manage', () => {
		const scoped = {
			availabilityEntries: [smithOnLeave, { ...smithOnLeave, id: 'entry-2', personnelId: 'person-2' }],
			canEditAvailabilityFor: (person: Personnel) => person.id === 'person-1',
			onQuickAdd: vi.fn(),
			onResize: vi.fn()
		};
		renderCalendar({ ...scoped, popoverEntry: { personId: 'person-1', entryId: 'entry-1' } });
		expect(document.querySelector('[data-edge="end"]')).not.toBeNull();
		cleanup();

		renderCalendar({ ...scoped, popoverEntry: { personId: 'person-2', entryId: 'entry-2' } });

		expect(document.querySelector('[data-edge]')).toBeNull();
	});

	it('draws no resize grips while a change is still saving', async () => {
		const { rerender } = renderCalendar({
			availabilityEntries: [smithOnLeave],
			popoverEntry: { personId: 'person-1', entryId: 'entry-1' },
			onQuickAdd: vi.fn(),
			onResize: vi.fn(),
			saving: true
		});
		expect(document.querySelector('[data-edge]')).toBeNull();

		await rerender({ saving: false });

		expect(document.querySelector('[data-edge="end"]')).not.toBeNull();
	});

	it('starts no drag while a change is still saving', async () => {
		const rect = vi
			.spyOn(Element.prototype, 'getBoundingClientRect')
			.mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 62, height: 36 }));
		const onQuickAdd = vi.fn();
		const pointer = { button: 0, pointerId: 1, pointerType: 'mouse' };
		const drag = async () => {
			await fireEvent.pointerDown(screen.getByRole('button', { name: 'SGT Smith, Alex, Sunday, March 1, 2026' }), {
				...pointer,
				clientX: 10
			});
			await fireEvent.pointerMove(window, { ...pointer, clientX: 50 });
			await fireEvent.pointerUp(window, { ...pointer, clientX: 50 });
		};
		try {
			const { rerender } = renderCalendar({ canEdit: true, onQuickAdd, saving: true });
			await drag();
			expect(onQuickAdd).not.toHaveBeenCalled();

			await rerender({ saving: false });
			await drag();

			expect(onQuickAdd).toHaveBeenCalledExactlyOnceWith(
				expect.objectContaining({ id: 'person-1' }),
				'2026-03-01',
				'2026-03-02',
				expect.any(HTMLElement)
			);
		} finally {
			rect.mockRestore();
		}
	});

	it('drops a drag on Escape or a cancelled pointer and opens no day editor from the click that ends a drag', async () => {
		const rect = vi
			.spyOn(Element.prototype, 'getBoundingClientRect')
			.mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 62, height: 36 }));
		const onQuickAdd = vi.fn();
		const onCellClick = vi.fn();
		const pointer = { button: 0, pointerId: 1, pointerType: 'mouse' };
		try {
			renderCalendar({ canEdit: true, onQuickAdd, onCellClick });
			const day = screen.getByRole('button', { name: 'SGT Smith, Alex, Sunday, March 1, 2026' });

			await fireEvent.pointerDown(day, { ...pointer, clientX: 10 });
			await fireEvent.pointerMove(window, { ...pointer, clientX: 50 });
			await fireEvent.keyDown(window, { key: 'Escape' });
			await fireEvent.pointerUp(window, { ...pointer, clientX: 50 });
			await fireEvent.pointerDown(day, { ...pointer, clientX: 10 });
			await fireEvent.pointerMove(window, { ...pointer, clientX: 50 });
			await fireEvent.pointerCancel(window, pointer);
			await fireEvent.pointerUp(window, { ...pointer, clientX: 50 });
			expect(onQuickAdd).not.toHaveBeenCalled();

			await fireEvent.pointerDown(day, { ...pointer, clientX: 10 });
			await fireEvent.pointerMove(window, { ...pointer, clientX: 50 });
			await fireEvent.pointerUp(window, { ...pointer, clientX: 50 });
			await fireEvent.click(day);

			expect(onQuickAdd).toHaveBeenCalledTimes(1);
			expect(onCellClick).not.toHaveBeenCalled();
		} finally {
			rect.mockRestore();
		}
	});

	it('hides personnel roles when role display is disabled', () => {
		const { queryByText } = renderCalendar({ showPersonnelRoles: false });
		expect(queryByText('Medic')).toBeNull();
	});

	it('opens a distant person after scrolling the roster', async () => {
		const largeRoster = makePersonnel(120);
		const onPersonClick = vi.fn();
		const { container } = renderCalendar({
			personnelByGroup: [{ group: 'Alpha', personnel: largeRoster }],
			onPersonClick
		});

		const calendarBody = container.querySelector('.calendar-body') as HTMLDivElement | null;
		if (!calendarBody) {
			throw new Error('Calendar body was not rendered');
		}

		Object.defineProperty(calendarBody, 'clientHeight', {
			configurable: true,
			value: 260
		});
		Object.defineProperty(calendarBody, 'scrollTop', {
			configurable: true,
			writable: true,
			value: 10_000
		});
		await fireEvent.scroll(calendarBody);
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: /Person 120, First 120$/ }));
		expect(onPersonClick).toHaveBeenCalledWith(expect.objectContaining({ id: 'person-120' }));
	});

	describe('upcoming-loss indicators', () => {
		it('renders a loss indicator chip in the row header for a person in the loss map', () => {
			const lossMap = new Map([['person-1', makeLossRecord('person-1', 'ETS')]]);
			const { container } = renderCalendar({ upcomingLossMap: lossMap });

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
			const { container } = renderCalendar({ upcomingLossMap: new Map() });

			expect(container.querySelector('[data-testid="loss-indicator-person-1"]')).toBeNull();
			expect(container.querySelector('[data-testid="loss-indicator-person-2"]')).toBeNull();
		});

		it('does not render a chip at all when no loss map is provided', () => {
			const { container } = renderCalendar();

			expect(container.querySelector('[data-testid^="loss-indicator-"]')).toBeNull();
		});

		it('only shows chips for personnel that have a loss record, leaving others clean', () => {
			const lossMap = new Map([['person-1', makeLossRecord('person-1', 'ETS')]]);
			const { container } = renderCalendar({ upcomingLossMap: lossMap });

			expect(container.querySelector('[data-testid="loss-indicator-person-1"]')).toBeTruthy();
			expect(container.querySelector('[data-testid="loss-indicator-person-2"]')).toBeNull();
		});
	});
});

describe('Calendar lanes', () => {
	const march1 = new Date(2026, 2, 1);
	const march2 = new Date(2026, 2, 2);
	const staffDuty: AssignmentType = {
		id: 'type-sd',
		name: 'Staff Duty',
		shortName: 'SD',
		assignTo: 'personnel',
		color: '#b91c1c',
		exemptPersonnelIds: [],
		showOnCalendar: true,
		sortOrder: 0
	};
	const charge: AssignmentType = { ...staffDuty, id: 'type-cq', name: 'Charge of Quarters', shortName: 'CQ' };
	const columbus: SpecialDay = { id: 'day-1', date: '2026-03-02', name: 'Columbus Day', type: 'federal-holiday' };
	const smithOnDuty: DailyAssignment = {
		id: 'assignment-1',
		date: '2026-03-01',
		assignmentTypeId: 'type-sd',
		assigneeId: 'person-1'
	};

	function lanesFor(actions?: Parameters<typeof buildCalendarLanes>[0]['actions']) {
		return buildCalendarLanes({
			dates: [march1, march2],
			assignmentTypes: [staffDuty],
			assignments: [smithOnDuty],
			specialDays: [columbus],
			personnel,
			groups: [],
			actions
		});
	}

	it('renders lanes as groups named by label and described by summary', () => {
		renderCalendar({ lanes: lanesFor(), specialDays: [columbus] });

		screen.getByRole('group', { name: 'Staff Duty', description: /1 of 2/ });
		const days = screen.getByRole('group', { name: 'Days', description: /Columbus Day/ });
		expect(within(days).getByText('Columbus Day')).toBeTruthy();
	});

	it('names each assigned day for viewers by type, date and assignee without assignment targets', () => {
		renderCalendar({ lanes: lanesFor() });

		const duty = screen.getByRole('group', { name: 'Staff Duty' });
		expect(within(duty).getByText('Staff Duty for Sunday, March 1, 2026: SGT Smith, Alex')).toBeTruthy();
		expect(within(duty).queryByRole('button', { name: /^Assign Staff Duty/ })).toBeNull();
		expect(within(duty).queryByRole('button', { name: /Edit assignments/ })).toBeNull();
	});

	it('opens the duty picker from an open day and the assignments from an assigned day', async () => {
		const actions = { openDay: vi.fn(), editDay: vi.fn() };
		renderCalendar({ lanes: lanesFor(actions) });

		const open = screen.getByRole('button', { name: 'Assign Staff Duty for Monday, March 2, 2026' });
		await fireEvent.click(open);
		expect(actions.openDay).toHaveBeenCalledWith('type-sd', march2, open);

		await fireEvent.click(
			screen.getByRole('button', {
				name: 'Staff Duty for Sunday, March 1, 2026: SGT Smith, Alex. Edit assignments'
			})
		);
		expect(actions.editDay).toHaveBeenCalledWith(march1);
	});

	it('renders a third lane kind without layout changes', async () => {
		const onOpen = vi.fn();
		const suspenses: CalendarLane = {
			key: 'fixture:suspenses',
			kind: 'fixture-suspense',
			label: 'Suspenses',
			summary: 'Suspenses: Roster to BN S3 on March 2',
			track: spanTrack(FixtureLaneSegment, [{ start: 1, end: 1, value: { name: 'Roster to BN S3', onOpen } }])
		};
		renderCalendar({ lanes: [...lanesFor(), suspenses] });

		const fixture = screen.getByRole('group', {
			name: 'Suspenses',
			description: 'Suspenses: Roster to BN S3 on March 2'
		});
		await fireEvent.click(within(fixture).getByRole('button', { name: 'Roster to BN S3' }));
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	it('makes each row marker its own target beside the cell button', async () => {
		const onMarkerClick = vi.fn();
		const onCellClick = vi.fn();
		renderCalendar({
			assignmentTypes: [staffDuty, charge],
			assignments: [smithOnDuty, { ...smithOnDuty, id: 'assignment-2', assignmentTypeId: 'type-cq' }],
			onMarkerClick,
			onCellClick
		});

		const cell = screen.getByRole('button', { name: 'SGT Smith, Alex, Sunday, March 1, 2026' });
		const marker = screen.getByRole('button', {
			name: 'Staff Duty, SGT Smith, Alex, Sunday, March 1, 2026. Edit assignments'
		});
		const more = screen.getByRole('button', {
			name: '1 more: Charge of Quarters, SGT Smith, Alex, Sunday, March 1, 2026. Edit assignments'
		});
		expect(cell.contains(marker)).toBe(false);

		await fireEvent.click(marker);
		await fireEvent.click(more);
		expect(onMarkerClick.mock.calls).toEqual([[march1], [march1]]);
		expect(onCellClick).not.toHaveBeenCalled();
	});

	it('keeps row markers passive without a marker action', () => {
		renderCalendar({ assignmentTypes: [staffDuty], assignments: [smithOnDuty] });

		expect(screen.queryByRole('button', { name: /Edit assignments/ })).toBeNull();
		expect(screen.getByTitle('Staff Duty, SGT Smith, Alex, Sunday, March 1, 2026').textContent).toBe('SD');
	});
});
