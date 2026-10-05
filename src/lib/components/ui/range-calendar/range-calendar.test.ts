// @vitest-environment happy-dom
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

	it('exposes dates outside caller bounds as disabled and refuses to select them', async () => {
		render(RangeCalendarTest, { bounded: true });
		const beforeMinimum = screen.getByRole('button', { name: /September 29, 2026/ });
		const afterMaximum = screen.getByRole('button', { name: /October 3, 2026/ });
		expect(beforeMinimum.getAttribute('aria-disabled')).toBe('true');
		expect(afterMaximum.getAttribute('aria-disabled')).toBe('true');
		await fireEvent.click(beforeMinimum);
		await fireEvent.click(afterMaximum);
		expect(screen.getByLabelText('Selected start date').textContent).toBe('');
		expect(screen.getByLabelText('Selected end date').textContent).toBe('');

		await fireEvent.click(screen.getByRole('button', { name: /September 30, 2026/ }));
		await fireEvent.click(screen.getByRole('button', { name: /October 2, 2026/ }));
		expect(screen.getByLabelText('Selected start date').textContent).toBe('2026-09-30');
		expect(screen.getByLabelText('Selected end date').textContent).toBe('2026-10-02');
	});
});
