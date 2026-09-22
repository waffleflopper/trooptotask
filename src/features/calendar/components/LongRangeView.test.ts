// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
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
		textColor: '#ffffff',
		da6TreatmentReviewed: true
	}
];

const specialDays: SpecialDay[] = [];
const assignmentTypes: AssignmentType[] = [];
const assignments: DailyAssignment[] = [];

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
		resizeObserverCallback = undefined;
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
		const getScrollAreaRect = vi.fn(
			() =>
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
		);
		const getRosterRect = vi.fn(
			() =>
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
		);

		Object.defineProperty(scrollArea, 'getBoundingClientRect', {
			configurable: true,
			value: getScrollAreaRect
		});
		Object.defineProperty(rosterRows, 'getBoundingClientRect', {
			configurable: true,
			value: getRosterRect
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

		triggerResizeObserver();
		await tick();
		getScrollAreaRect.mockClear();
		getRosterRect.mockClear();

		await fireEvent.scroll(scrollArea);

		expect(getScrollAreaRect).not.toHaveBeenCalled();
		expect(getRosterRect).not.toHaveBeenCalled();
		expect(container.textContent).not.toContain('Person 001');
		expect(container.textContent).toContain('Person 020');
		expect(container.textContent).not.toContain('Person 120');
	});

	it('refreshes virtual rows when the long-range scroll area resizes without scrolling', async () => {
		const largeRoster = makePersonnel(120);
		const { container } = renderView({
			personnelByGroup: [{ group: 'Alpha', personnel: largeRoster }]
		});

		const scrollArea = container.querySelector('.scroll-area') as HTMLDivElement | null;
		expect(scrollArea).toBeTruthy();

		if (!scrollArea) {
			throw new Error('Long range scroll area was not rendered');
		}

		Object.defineProperty(scrollArea, 'scrollTop', {
			configurable: true,
			writable: true,
			value: 0
		});
		Object.defineProperty(scrollArea, 'clientHeight', {
			configurable: true,
			value: 120
		});

		triggerResizeObserver();
		await tick();

		expect(container.textContent).not.toContain('Person 040');

		Object.defineProperty(scrollArea, 'clientHeight', {
			configurable: true,
			value: 900
		});

		triggerResizeObserver();
		await tick();

		expect(container.textContent).toContain('Person 040');
	});
});
