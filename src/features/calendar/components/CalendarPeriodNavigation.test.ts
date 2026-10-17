// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { formatDate } from '$lib/utils/dates';
import type { CalendarViewMode } from '$features/calendar/utils/calendarRange';
import PeriodNavigationHarness from '../test-support/PeriodNavigationHarness.svelte';

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function renderNavigation(props: { view?: CalendarViewMode; anchor?: Date; disabled?: boolean } = {}): string[] {
	const anchors: string[] = [];
	render(PeriodNavigationHarness, {
		props: {
			view: props.view ?? 'month',
			anchor: props.anchor ?? new Date(2026, 9, 1),
			disabled: props.disabled,
			onAnchorChange: (anchor: Date) => anchors.push(formatDate(anchor))
		}
	});
	return anchors;
}

describe('CalendarPeriodNavigation', () => {
	it('steps three months at a time in 3-Month and names the shown quarter', async () => {
		const anchors = renderNavigation({ view: '3-month', anchor: new Date(2026, 10, 1) });

		expect(screen.getByRole('button', { name: 'November 2026 – January 2027' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Next 3 months' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Previous 3 months' }));

		expect(anchors).toEqual(['2027-02-01', '2026-08-01']);
	});

	it.each(['month', '3-month'] as const)('returns to the current month from Today in %s', async (view) => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 9, 31, 9));
		const anchors = renderNavigation({ view, anchor: new Date(2027, 4, 1) });

		await fireEvent.click(screen.getByRole('button', { name: 'Today' }));

		expect(anchors).toEqual(['2026-10-01']);
	});

	it('moves nothing while disabled', async () => {
		const anchors = renderNavigation({ disabled: true });

		await fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Today' }));

		expect(anchors).toEqual([]);
	});
});

describe('CalendarPeriodNavigation month picker', () => {
	async function openPicker(props: { view?: CalendarViewMode; anchor?: Date } = {}) {
		const anchors = renderNavigation(props);
		const trigger = screen.getByRole('button', { name: /2026/ });
		trigger.focus();
		await fireEvent.click(trigger);
		return { trigger, anchors };
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
