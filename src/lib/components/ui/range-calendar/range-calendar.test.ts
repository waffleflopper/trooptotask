// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { CalendarDate } from '@internationalized/date';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import RangeCalendarTest from './RangeCalendarTest.svelte';

describe('RangeCalendar public selection', () => {
	afterEach(cleanup);

	it('selects a range by keyboard and retains focus and selected semantics', async () => {
		render(RangeCalendarTest);
		const start = screen.getByRole('button', { name: /September 28, 2026/ });
		start.focus();
		await fireEvent.keyDown(start, { key: 'Enter' });
		expect(screen.getByLabelText('Selected start date').textContent).toBe('2026-09-28');
		expect(screen.getByLabelText('Selected end date').textContent).toBe('');

		await fireEvent.keyDown(start, { key: 'ArrowRight' });
		const middle = screen.getByRole('button', { name: /September 29, 2026/ });
		await waitFor(() => expect(document.activeElement).toBe(middle));
		await fireEvent.keyDown(middle, { key: 'ArrowRight' });
		const end = screen.getByRole('button', { name: /September 30, 2026/ });
		await waitFor(() => expect(document.activeElement).toBe(end));
		await fireEvent.keyDown(end, { key: ' ' });

		expect(screen.getByLabelText('Selected start date').textContent).toBe('2026-09-28');
		expect(screen.getByLabelText('Selected end date').textContent).toBe('2026-09-30');
		expect(document.activeElement).toBe(end);
		const selectedCells = screen.getAllByRole('gridcell', { selected: true });
		for (const date of [/September 28, 2026/, /September 29, 2026/, /September 30, 2026/]) {
			expect(selectedCells.some((cell) => within(cell).queryByRole('button', { name: date }))).toBe(true);
		}
	});

	it('rejects dates outside caller bounds and keeps keyboard selection and focus usable across months', async () => {
		render(RangeCalendarTest, { bounded: true });
		const beforeMinimum = screen.getByRole('button', { name: /September 29, 2026/ });
		const afterMaximum = screen.getByRole('button', { name: /October 3, 2026/ });
		expect(beforeMinimum.getAttribute('aria-disabled')).toBe('true');
		expect(afterMaximum.getAttribute('aria-disabled')).toBe('true');
		await fireEvent.click(beforeMinimum);
		await fireEvent.click(afterMaximum);
		expect(screen.getByLabelText('Selected start date').textContent).toBe('');
		expect(screen.getByLabelText('Selected end date').textContent).toBe('');

		const start = screen.getByRole('button', { name: /September 30, 2026/ });
		start.focus();
		await fireEvent.keyDown(start, { key: 'Enter' });
		expect(screen.getByLabelText('Selected start date').textContent).toBe('2026-09-30');
		expect(screen.getByLabelText('Selected end date').textContent).toBe('');
		await fireEvent.keyDown(start, { key: 'ArrowRight' });
		const middle = await screen.findByRole('button', { name: /October 1, 2026/ });
		await waitFor(() => expect(document.activeElement).toBe(middle));
		await fireEvent.keyDown(middle, { key: 'ArrowRight' });
		const end = screen.getByRole('button', { name: /October 2, 2026/ });
		await waitFor(() => expect(document.activeElement).toBe(end));
		await fireEvent.keyDown(end, { key: ' ' });

		expect(screen.getByLabelText('Selected start date').textContent).toBe('2026-09-30');
		expect(screen.getByLabelText('Selected end date').textContent).toBe('2026-10-02');
		expect.soft(document.activeElement).toHaveAccessibleName(/October 2, 2026/);
		const selectedCells = screen.getAllByRole('gridcell', { selected: true });
		for (const date of [/September 30, 2026/, /October 1, 2026/, /October 2, 2026/]) {
			expect(selectedCells.some((cell) => within(cell).queryByRole('button', { name: date }))).toBe(true);
		}
	});

	it('retains usable end-date focus when a selected range ends beyond the starting month trailing week', async () => {
		render(RangeCalendarTest, { initialDate: new CalendarDate(2026, 9, 30) });
		const start = screen.getByRole('button', { name: /September 30, 2026/ });
		start.focus();
		await fireEvent.keyDown(start, { key: 'Enter' });

		for (const date of [
			/October 1, 2026/,
			/October 2, 2026/,
			/October 3, 2026/,
			/October 4, 2026/,
			/October 5, 2026/,
			/October 6, 2026/,
			/October 7, 2026/,
			/October 8, 2026/,
			/October 9, 2026/,
			/October 10, 2026/
		]) {
			await fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
			const next = await screen.findByRole('button', { name: date });
			await waitFor(() => expect(document.activeElement).toBe(next));
		}

		await fireEvent.keyDown(document.activeElement!, { key: ' ' });
		expect(screen.getByLabelText('Selected start date')).toHaveTextContent('2026-09-30');
		expect(screen.getByLabelText('Selected end date')).toHaveTextContent('2026-10-10');
		expect(screen.getByLabelText('Notified start date')).toHaveTextContent('2026-09-30');
		expect(screen.getByLabelText('Notified end date')).toHaveTextContent('2026-10-10');
		expect.soft(screen.getByLabelText('Notified view date')).toHaveTextContent('2026-10-10');
		expect.soft(document.activeElement).toHaveAccessibleName(/October 10, 2026/);
		expect(screen.queryByRole('button', { name: /October 10, 2026/ })).not.toBeNull();
	});

	it('shows a caller-supplied new range without emitting a selection change', async () => {
		render(RangeCalendarTest);
		await fireEvent.click(screen.getByRole('button', { name: 'Apply external date range' }));
		expect(screen.getByLabelText('Selected start date')).toHaveTextContent('2026-11-05');
		expect(screen.getByLabelText('Selected end date')).toHaveTextContent('2026-11-10');
		expect(screen.getByLabelText('Notified view date')).toHaveTextContent('2026-11-05');
		expect(screen.getByLabelText('Notified start date').textContent).toBe('');
		expect(screen.getByLabelText('Notified end date').textContent).toBe('');
		const selectedCells = screen.getAllByRole('gridcell', { selected: true });
		for (const date of [/November 5, 2026/, /November 10, 2026/]) {
			expect(selectedCells.some((cell) => within(cell).queryByRole('button', { name: date }))).toBe(true);
		}
	});

	it('retains the caller view and month navigation when only the externally supplied range end changes', async () => {
		render(RangeCalendarTest);
		await fireEvent.click(screen.getByRole('button', { name: 'Apply external date range' }));
		await fireEvent.click(screen.getByRole('button', { name: 'View December' }));
		expect(screen.getByRole('button', { name: /December 15, 2026/ })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: /^Next$/ }));
		expect(screen.getByRole('button', { name: /January 15, 2027/ })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Change external end date' }));
		expect(screen.getByLabelText('Selected start date')).toHaveTextContent('2026-11-05');
		expect(screen.getByLabelText('Selected end date')).toHaveTextContent('2026-11-12');
		expect.soft(screen.queryByRole('button', { name: /January 15, 2027/ })).not.toBeNull();
		expect(screen.getByLabelText('Notified start date').textContent).toBe('');
		expect(screen.getByLabelText('Notified end date').textContent).toBe('');
	});
});
