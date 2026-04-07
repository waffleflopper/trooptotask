// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import LongRangeView from './LongRangeView.svelte';
import type { AssignmentType, DailyAssignment, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

type LongRangeViewProps = {
	startDate: Date;
	personnelByGroup: { group: string; personnel: Personnel[] }[];
	availabilityEntries: [];
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
});
