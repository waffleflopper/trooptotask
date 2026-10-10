// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import CalendarNavigation from './CalendarNavigation.svelte';

afterEach(cleanup);

async function openPicker() {
	const onSelectMonthYear = vi.fn();
	render(CalendarNavigation, {
		props: {
			title: 'October 2026',
			onPrev: vi.fn(),
			onNext: vi.fn(),
			onGoToToday: vi.fn(),
			pickerYear: 2026,
			pickerMonth: 9,
			onSelectMonthYear
		}
	});
	const trigger = screen.getByRole('button', { name: 'October 2026' });
	trigger.focus();
	await fireEvent.click(trigger);
	return { trigger, onSelectMonthYear };
}

describe('CalendarNavigation month picker', () => {
	it('returns focus to the month title after Escape', async () => {
		const { trigger } = await openPicker();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Oct' }));

		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(screen.queryByRole('dialog')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('returns focus to the month title after clicking a month', async () => {
		const { trigger, onSelectMonthYear } = await openPicker();

		await fireEvent.click(screen.getByRole('button', { name: 'Mar' }));

		expect(onSelectMonthYear).toHaveBeenCalledWith(2026, 2);
		expect(screen.queryByRole('dialog')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it('returns focus to the month title after choosing a month with Enter', async () => {
		const { trigger, onSelectMonthYear } = await openPicker();

		await fireEvent.keyDown(screen.getByRole('button', { name: 'Oct' }), { key: 'Enter' });

		expect(onSelectMonthYear).toHaveBeenCalledWith(2026, 9);
		expect(document.activeElement).toBe(trigger);
	});
});
