// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import LongRangeView from './LongRangeView.svelte';
import type { Personnel } from '$features/personnel/contracts';
import type { SpecialDay, StatusType, AvailabilityEntry } from '$features/calendar/contracts';
import { buildAvailabilityTracks } from '$features/calendar/utils/availabilityTracks';

type LongRangeViewProps = {
	startDate: Date;
	personnelByGroup: { groupId: string | null; group: string; personnel: Personnel[] }[];
	availabilityEntries: AvailabilityEntry[];
	specialDays: SpecialDay[];
	onDateColumnClick?: (date: Date) => void;
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
		textColor: '#ffffff',
		shortLabel: null,
		rosterEffect: 'A',
		sortOrder: 0
	}
];

const specialDays: SpecialDay[] = [];

const resizeObserve = vi.fn();
const resizeDisconnect = vi.fn();

class MockResizeObserver {
	observe = resizeObserve;
	disconnect = resizeDisconnect;
	unobserve = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

function renderView({ availabilityEntries = [], ...overrides }: Partial<LongRangeViewProps> = {}) {
	const view = render(LongRangeView, {
		props: {
			startDate: new Date(2026, 2, 1),
			personnelByGroup: [{ groupId: 'group-1', group: 'Alpha', personnel }],
			tracks: buildAvailabilityTracks(availabilityEntries, statusTypes),
			specialDays,
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

	it('names each date column with its full date and jumps to that date', async () => {
		const onDateColumnClick = vi.fn();
		renderView({ onDateColumnClick });

		await fireEvent.click(
			screen.getByRole('button', { name: 'Saturday, April 4, 2026', description: 'Jump to April 2026' })
		);

		expect(onDateColumnClick).toHaveBeenCalledWith(new Date(2026, 3, 4));
	});

	it('shows a distant person’s leave after scrolling the long-range roster', async () => {
		const roster = Array.from({ length: 60 }, (_, index) => ({
			...personnel[0]!,
			id: `person-${index + 1}`,
			lastName: `Person ${index + 1}`
		}));
		const { container } = renderView({
			personnelByGroup: [{ groupId: 'group-1', group: 'Alpha', personnel: roster }],
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
			expect(
				within(personRow as HTMLElement).getByRole('button', {
					name: 'SGT Person 60, Alex, Leave, 5 March 2026, 1 day'
				})
			).toBeTruthy();
		});
	});
});
