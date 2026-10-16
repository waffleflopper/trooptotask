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
	it('steps one month at a time across a year boundary in Month', async () => {
		const { anchors } = renderRow({ anchor: new Date(2026, 11, 1) });

		expect(screen.getByRole('heading', { level: 1, name: 'December 2026' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));

		expect(anchors).toEqual(['2027-01-01', '2026-11-01']);
	});

	it('steps three months at a time in 3-Month and names the shown quarter', async () => {
		const { anchors } = renderRow({ view: '3-month', anchor: new Date(2026, 10, 1) });

		expect(screen.getByRole('heading', { level: 1, name: 'November 2026 – January 2027' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Next 3 months' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Previous 3 months' }));

		expect(anchors).toEqual(['2027-02-01', '2026-08-01']);
	});

	it.each(['month', '3-month'] as const)('returns to the current month from Today in %s', async (view) => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 16, 9));
		const { anchors } = renderRow({ view, anchor: new Date(2027, 4, 1) });

		await fireEvent.click(screen.getByRole('button', { name: 'Today' }));

		expect(anchors).toEqual(['2026-10-01']);
	});

	it('shows today’s availability and hides it when there is no count', () => {
		renderRow({ today: { date: new Date(2026, 9, 16), available: 19, total: 22 } });
		expect(availabilityTexts()).toEqual(['19 of 22 available']);
		expect(screen.getByText('Today · Fri 16 Oct')).toBeTruthy();
		cleanup();

		renderRow({ today: null });
		expect(availabilityTexts()).toEqual([]);
		expect(screen.getByRole('heading', { level: 1, name: 'October 2026' })).toBeTruthy();
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

describe('CalendarTitleRow month picker', () => {
	async function openPicker(props: { view?: CalendarViewMode; anchor?: Date } = {}) {
		const result = renderRow(props);
		const trigger = screen.getByRole('button', { name: /2026/ });
		trigger.focus();
		await fireEvent.click(trigger);
		return { trigger, ...result };
	}

	it('returns focus to the title after Escape', async () => {
		const { trigger } = await openPicker();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Oct' }));

		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(screen.queryByRole('dialog')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('moves to a clicked month and returns focus to the title', async () => {
		const { trigger, anchors } = await openPicker();

		await fireEvent.click(screen.getByRole('button', { name: 'Mar' }));

		expect(anchors).toEqual(['2026-03-01']);
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('starts the 3-Month view at a month chosen with Enter', async () => {
		const { trigger, anchors } = await openPicker({ view: '3-month', anchor: new Date(2026, 9, 1) });

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Jan' }), { key: 'Enter' });

		expect(anchors).toEqual(['2026-01-01']);
		expect(document.activeElement).toBe(trigger);
	});
});
