// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import LongRangeView from './LongRangeView.svelte';
import type { AssignmentType, DailyAssignment, Personnel, SpecialDay, StatusType, AvailabilityEntry } from '$lib/types';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

type LongRangeViewProps = {
	startDate: Date;
	personnelByGroup: { group: string; personnel: Personnel[] }[];
	availabilityEntries: AvailabilityEntry[];
	statusTypes: StatusType[];
	specialDays: SpecialDay[];
	assignmentTypes: AssignmentType[];
	assignments: DailyAssignment[];
	dutyEvents?: DutyEvent[];
	dutyStartDayOnly?: boolean;
	onDateColumnClick?: (date: Date) => void;
	onToggleViewMode?: () => void;
};

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

function makePersonnel(count: number): Personnel[] {
	return Array.from({ length: count }, (_, index) => ({
		id: `person-${index + 1}`,
		firstName: `First ${index + 1}`,
		lastName: `Person ${String(index + 1).padStart(3, '0')}`,
		rank: 'SGT',
		groupId: 'group-1',
		groupName: 'Alpha',
		clinicRole: '',
		mos: '11B'
	}));
}

const statusTypes: StatusType[] = [
	{
		id: 'leave',
		name: 'Leave',
		color: '#2563eb',
		textColor: '#ffffff'
	}
];

const specialDays: SpecialDay[] = [];
const assignmentTypes: AssignmentType[] = [];
const assignments: DailyAssignment[] = [];

function renderView(overrides: Partial<LongRangeViewProps> = {}) {
	return render(LongRangeView, {
		props: {
			startDate: new Date(2026, 2, 1),
			personnelByGroup: [{ group: 'Alpha', personnel }],
			availabilityEntries: [],
			statusTypes,
			specialDays,
			assignmentTypes,
			assignments,
			...overrides
		}
	});
}

describe('LongRangeView', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders the shared view toggle in the calendar header area', () => {
		renderView({ onToggleViewMode: vi.fn() });

		expect(screen.getByTestId('calendar-view-toggle')).toBeTruthy();
		expect(screen.getByTestId('long-range-date-label').textContent).toContain('March 2026');
	});

	it('toggles back to month view from the shared header control', async () => {
		const onToggleViewMode = vi.fn();
		renderView({ onToggleViewMode });

		await fireEvent.click(screen.getByTestId('calendar-view-toggle'));

		expect(onToggleViewMode).toHaveBeenCalledTimes(1);
	});

	it('clicking a date column calls the month jump callback', async () => {
		const onDateColumnClick = vi.fn();
		renderView({ onDateColumnClick });

		const marchButtons = screen.getAllByTitle('Jump to March 2026');
		await fireEvent.click(marchButtons[0]);

		expect(onDateColumnClick).toHaveBeenCalledTimes(1);
		expect(onDateColumnClick.mock.calls[0][0]).toBeInstanceOf(Date);
		expect(onDateColumnClick.mock.calls[0][0].getMonth()).toBe(2);
	});

	it('renders a duty indicator for a person assigned to an advanced duty event on that day', () => {
		const dutyEvent: DutyEvent = {
			id: 'evt-1',
			orgId: 'org-1',
			templateId: 'tpl-1',
			templateName: 'Staff Duty',
			eventDate: '2026-03-10',
			coverageMode: 'timed',
			coverageStart: '2026-03-10T08:00:00',
			coverageEnd: '2026-03-11T08:00:00',
			isBlocking: true,
			cooldownHours: 24,
			rulesSnapshot: {
				templateId: 'tpl-1',
				templateName: 'Staff Duty',
				templateStatus: 'active',
				coverageMode: 'timed',
				startTime: '08:00',
				endTime: '08:00',
				scopeType: 'organization',
				scopeGroupIds: [],
				isBlocking: true,
				cooldownHours: 24,
				slots: []
			},
			fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
			collisionSummary: { hasConflicts: false, conflicts: [] },
			originalProposal: null,
			createdAt: '2026-03-01T00:00:00Z',
			updatedAt: '2026-03-01T00:00:00Z',
			runId: null,
			slotInstances: [
				{
					id: 'slot-1',
					dutyEventId: 'evt-1',
					templateSlotId: 'tslot-1',
					roleLabel: 'NCO',
					slotIndex: 0,
					assigneeId: 'person-1',
					assignmentSource: 'generated',
					warningState: 'none',
					fairnessConfidence: 'high',
					selectionReason: null,
					unfilledReason: null,
					sortOrder: 0
				}
			]
		};

		// Default: startDayOnly=true — badge only on start date
		const { container } = renderView({ dutyEvents: [dutyEvent] });
		const indicators = container.querySelectorAll('.duty-indicator');
		expect(indicators.length).toBe(1);
	});

	it('renders duty indicators on every covered day when dutyStartDayOnly is false', () => {
		const dutyEvent: DutyEvent = {
			id: 'evt-2',
			orgId: 'org-1',
			templateId: 'tpl-1',
			templateName: 'Staff Duty',
			eventDate: '2026-03-10',
			coverageMode: 'timed',
			coverageStart: '2026-03-10T08:00:00',
			coverageEnd: '2026-03-11T08:00:00',
			isBlocking: true,
			cooldownHours: 24,
			rulesSnapshot: {
				templateId: 'tpl-1',
				templateName: 'Staff Duty',
				templateStatus: 'active',
				coverageMode: 'timed',
				startTime: '08:00',
				endTime: '08:00',
				scopeType: 'organization',
				scopeGroupIds: [],
				isBlocking: true,
				cooldownHours: 24,
				slots: []
			},
			fillSummary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
			collisionSummary: { hasConflicts: false, conflicts: [] },
			originalProposal: null,
			createdAt: '2026-03-01T00:00:00Z',
			updatedAt: '2026-03-01T00:00:00Z',
			runId: null,
			slotInstances: [
				{
					id: 'slot-2',
					dutyEventId: 'evt-2',
					templateSlotId: 'tslot-1',
					roleLabel: 'NCO',
					slotIndex: 0,
					assigneeId: 'person-1',
					assignmentSource: 'generated',
					warningState: 'none',
					fairnessConfidence: 'high',
					selectionReason: null,
					unfilledReason: null,
					sortOrder: 0
				}
			]
		};

		const { container } = renderView({ dutyEvents: [dutyEvent], dutyStartDayOnly: false });
		const indicators = container.querySelectorAll('.duty-indicator');
		// Person-1 is assigned on Mar 10 and overnight coverage extends to Mar 11
		expect(indicators.length).toBeGreaterThanOrEqual(2);
	});

	it('opens the picker from the range label and updates the visible quarter start month', async () => {
		renderView();

		await fireEvent.click(screen.getByTestId('long-range-date-label'));

		expect(screen.getByRole('dialog', { name: 'Month and year picker' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Jan' }));

		expect(screen.getByTestId('long-range-date-label').textContent).toContain('January 2027');
		expect(screen.getByTestId('long-range-date-label').textContent).toContain('March 2027');
		expect(screen.queryByRole('dialog', { name: 'Month and year picker' })).toBeNull();
	});

	it('mounts a scrolling window of personnel rows for large rosters', async () => {
		const largeRoster = makePersonnel(120);
		const { container } = renderView({
			personnelByGroup: [{ group: 'Alpha', personnel: largeRoster }]
		});

		const scrollArea = container.querySelector('.scroll-area') as HTMLDivElement | null;
		const wrapper = container.querySelector('.long-range-wrapper') as HTMLElement | null;
		const firstPersonVirtualRow = container.querySelector('.virtual-row:nth-child(2)') as HTMLElement | null;
		expect(scrollArea).toBeTruthy();
		expect(wrapper?.style.getPropertyValue('--long-range-person-row-height')).toBe('22px');
		expect(firstPersonVirtualRow?.style.height).toBe('22px');
		expect(container.querySelectorAll('.person-row').length).toBeLessThan(largeRoster.length);
		expect(container.textContent).toContain('Person 001');

		if (!scrollArea) {
			throw new Error('Long range scroll area was not rendered');
		}

		Object.defineProperty(scrollArea, 'clientHeight', {
			configurable: true,
			value: 260
		});
		Object.defineProperty(scrollArea, 'scrollTop', {
			configurable: true,
			writable: true,
			value: 2600
		});

		await fireEvent.scroll(scrollArea);

		expect(container.textContent).not.toContain('Person 001');
		expect(container.textContent).toContain('Person 120');
		expect(container.querySelectorAll('.person-row').length).toBeLessThan(largeRoster.length);
	});

	it('calculates visible roster rows from the roster position inside the scroll area', async () => {
		const largeRoster = makePersonnel(120);
		const { container } = renderView({
			personnelByGroup: [{ group: 'Alpha', personnel: largeRoster }]
		});

		const scrollArea = container.querySelector('.scroll-area') as HTMLDivElement | null;
		const rosterRows = container.querySelector('.roster-rows') as HTMLDivElement | null;
		expect(scrollArea).toBeTruthy();
		expect(rosterRows).toBeTruthy();

		if (!scrollArea || !rosterRows) {
			throw new Error('Long range virtual roster was not rendered');
		}

		Object.defineProperty(rosterRows, 'offsetTop', {
			configurable: true,
			value: 900
		});
		Object.defineProperty(scrollArea, 'getBoundingClientRect', {
			configurable: true,
			value: () =>
				({
					top: 200,
					bottom: 460,
					height: 260,
					left: 0,
					right: 1000,
					width: 1000,
					x: 0,
					y: 200,
					toJSON: () => ({})
				}) as DOMRect
		});
		Object.defineProperty(rosterRows, 'getBoundingClientRect', {
			configurable: true,
			value: () =>
				({
					top: -236,
					bottom: 2404,
					height: 2640,
					left: 0,
					right: 1000,
					width: 1000,
					x: 0,
					y: -236,
					toJSON: () => ({})
				}) as DOMRect
		});
		Object.defineProperty(scrollArea, 'clientHeight', {
			configurable: true,
			value: 260
		});
		Object.defineProperty(scrollArea, 'scrollTop', {
			configurable: true,
			writable: true,
			value: 500
		});

		await fireEvent.scroll(scrollArea);

		expect(container.textContent).not.toContain('Person 001');
		expect(container.textContent).toContain('Person 020');
		expect(container.textContent).not.toContain('Person 120');
	});
});
