// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import SegmentedFilter from './segmented-filter.svelte';

afterEach(cleanup);

const options = [
	{ value: 'all', label: 'All' },
	{ value: 'active', label: 'Active' },
	{ value: 'retired', label: 'Retired', count: 3 }
];

function checked() {
	return screen.getByRole('radio', { checked: true }).textContent?.trim();
}

describe('SegmentedFilter', () => {
	it('is one Tab stop on the chosen option', () => {
		render(SegmentedFilter, { options, value: 'active', label: 'State' });

		expect(screen.getByRole('radiogroup', { name: 'State' })).toBeTruthy();
		expect(screen.getAllByRole('radio').map((radio) => radio.tabIndex)).toEqual([-1, 0, -1]);
	});

	it('moves and selects with the arrow keys, wrapping at either end', async () => {
		render(SegmentedFilter, { options, value: 'active', label: 'State' });
		const active = screen.getByRole('radio', { name: 'Active' });
		active.focus();

		await fireEvent.keyDown(active, { key: 'ArrowRight' });
		expect(checked()).toBe('Retired · 3');
		expect(document.activeElement?.textContent?.trim()).toBe('Retired · 3');

		await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
		expect(checked()).toBe('All');

		await fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
		expect(checked()).toBe('Retired · 3');
		expect(screen.getAllByRole('radio').map((radio) => radio.tabIndex)).toEqual([-1, -1, 0]);
	});

	it('shows the chosen option but takes no input when disabled', async () => {
		render(SegmentedFilter, { options, value: 'all', label: 'State', disabled: true });

		await fireEvent.click(screen.getByRole('radio', { name: 'Active' }));

		expect(checked()).toBe('All');
		expect(screen.getAllByRole('radio').every((radio) => (radio as HTMLButtonElement).disabled)).toBe(true);
	});
});
