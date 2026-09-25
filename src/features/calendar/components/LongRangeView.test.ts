// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import LongRangeView from './LongRangeView.svelte';
import type { AssignmentType, DailyAssignment, Personnel, SpecialDay, StatusType, AvailabilityEntry } from '$lib/types';

type LongRangeViewProps = {
	startDate: Date;
	onStartDateChange: (date: Date) => void;
	personnelByGroup: { group: string; personnel: Personnel[] }[];
	availabilityEntries: AvailabilityEntry[];
	statusTypes: StatusType[];
	specialDays: SpecialDay[];
	assignmentTypes: AssignmentType[];
	assignments: DailyAssignment[];
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

const resizeObserve = vi.fn();
const resizeDisconnect = vi.fn();

class MockResizeObserver {
	observe = resizeObserve;
	disconnect = resizeDisconnect;
	unobserve = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

function renderView(overrides: Partial<LongRangeViewProps> = {}) {
	const view = render(LongRangeView, {
		props: {
			startDate: new Date(2026, 2, 1),
			onStartDateChange: (startDate) => void view.rerender({ startDate }),
			personnelByGroup: [{ group: 'Alpha', personnel }],
			availabilityEntries: [],
			statusTypes,
			specialDays,
			assignmentTypes,
			assignments,
			...overrides
		}
	});
	return view;
}

describe('LongRangeView', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
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

	it('shows a distant person’s leave after scrolling the long-range roster', async () => {
		const roster = Array.from({ length: 60 }, (_, index) => ({
			...personnel[0]!,
			id: `person-${index + 1}`,
			lastName: `Person ${index + 1}`
		}));
		const { container } = renderView({
			personnelByGroup: [{ group: 'Alpha', personnel: roster }],
			availabilityEntries: [
				{
					id: 'person-60-leave',
					personnelId: 'person-60',
					statusTypeId: 'leave',
					startDate: '2026-03-05',
					endDate: '2026-03-05',
					note: null
				}
			]
		});
		const scrollArea = container.querySelector('.scroll-area');
		if (!scrollArea) throw new Error('Long-range roster was not rendered');
		Object.defineProperty(scrollArea, 'clientHeight', { configurable: true, value: 260 });

		await fireEvent.scroll(scrollArea, { target: { scrollTop: 1300 } });
		await waitFor(() => {
			const personRow = screen.getByText('Person 60').closest('.virtual-row');
			expect(personRow).toBeTruthy();
			expect(within(personRow as HTMLElement).getByTitle('Leave')).toBeTruthy();
		});
	});
});
