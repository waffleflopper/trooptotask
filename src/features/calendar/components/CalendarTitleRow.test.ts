// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { formatDate } from '$lib/utils/dates';
import type { CalendarViewMode } from '$features/calendar/utils/calendarRange';
import type { TodayAvailability } from '$features/calendar/contexts/CalendarPageContext.svelte';
import CalendarTitleRow from './CalendarTitleRow.svelte';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function renderRow(props: { view?: CalendarViewMode; anchor?: Date; today?: TodayAvailability | null } = {}): {
	anchors: string[];
	views: CalendarViewMode[];
} {
	const anchors: string[] = [];
	const views: CalendarViewMode[] = [];
	render(CalendarTitleRow, {
		props: {
			view: props.view ?? 'month',
			anchor: props.anchor ?? new Date(2026, 9, 1),
			today: props.today ?? null,
			orgName: '1-11 BDE',
			personnelCount: 22,
			onAnchorChange: (anchor: Date) => anchors.push(formatDate(anchor)),
			onViewChange: (view: CalendarViewMode) => views.push(view)
		}
	});
	return { anchors, views };
}

function availabilityTexts(): string[] {
	return screen
		.queryAllByText((_, element) =>
			/^\d+ of \d+ available$/.test(element?.textContent?.replace(/\s+/g, ' ').trim() ?? '')
		)
		.map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

describe('CalendarTitleRow', () => {
	it('shows today’s availability and hides it when there is no count', () => {
		renderRow({ today: { date: new Date(2026, 9, 16), available: 19, total: 22 } });
		expect(availabilityTexts()).toEqual(['19 of 22 available']);
		expect(screen.getByText('Today · Fri 16 Oct')).toBeTruthy();
		cleanup();

		renderRow({ today: null });
		expect(availabilityTexts()).toEqual([]);
		expect(screen.getByRole('button', { name: 'October 2026' })).toBeTruthy();
	});

	it('switches views and keeps one view chosen when the pressed one is clicked again', async () => {
		const { views } = renderRow();
		const switcher = within(screen.getByRole('group', { name: 'Calendar view' }));

		await fireEvent.click(switcher.getByRole('radio', { name: 'Month' }));
		expect(switcher.getByRole('radio', { name: 'Month' }).getAttribute('aria-checked')).toBe('true');
		await fireEvent.click(switcher.getByRole('radio', { name: '3-Month' }));

		expect(views).toEqual(['3-month']);
	});
});
