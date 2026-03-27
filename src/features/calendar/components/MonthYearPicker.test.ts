// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import MonthYearPicker from './MonthYearPicker.svelte';

afterEach(cleanup);

function renderPicker(props: Partial<{ year: number; month: number }> = {}) {
	const onSelect = vi.fn();
	const onClose = vi.fn();
	const result = render(MonthYearPicker, {
		props: {
			year: props.year ?? 2026,
			month: props.month ?? 2,
			onSelect,
			onClose
		}
	});
	return { ...result, onSelect, onClose };
}

describe('MonthYearPicker', () => {
	it('renders a 3x4 grid of month buttons and the current year', () => {
		renderPicker({ year: 2026 });

		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		for (const m of months) {
			expect(screen.getByRole('button', { name: m })).toBeTruthy();
		}
		expect(screen.getByText('2026')).toBeTruthy();
	});

	it('highlights the current displayed month', () => {
		renderPicker({ year: 2026, month: 2 });

		expect(screen.getByRole('button', { name: 'Mar' }).getAttribute('aria-current')).toBe('true');
	});

	it('calls onSelect with the chosen display year and month index', async () => {
		const { onSelect } = renderPicker({ year: 2026, month: 2 });

		await fireEvent.click(screen.getByRole('button', { name: 'Next year' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Jan' }));

		expect(onSelect).toHaveBeenCalledWith(2027, 0);
	});

	it('calls onClose when Escape is pressed', async () => {
		const { onClose } = renderPicker();

		await fireEvent.keyDown(window, { key: 'Escape' });

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('calls onClose when clicking outside the picker', async () => {
		const { onClose } = renderPicker();

		await fireEvent.mouseDown(document.body);

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it('supports keyboard navigation with arrow keys and Enter', async () => {
		const { onSelect } = renderPicker({ year: 2026, month: 2 });
		const marchButton = screen.getByRole('button', { name: 'Mar' });

		marchButton.focus();
		await fireEvent.keyDown(marchButton, { key: 'ArrowRight' });
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Apr' }), { key: 'ArrowDown' });
		await fireEvent.keyDown(screen.getByRole('button', { name: 'Jul' }), { key: 'Enter' });

		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Jul' }));
		expect(onSelect).toHaveBeenCalledWith(2026, 6);
	});
});
