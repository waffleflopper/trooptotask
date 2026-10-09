// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import GroupSelector from './GroupSelector.svelte';

afterEach(() => {
	cleanup();
});

describe('GroupSelector', () => {
	it('shows the selected count and reports toggled and removed values', async () => {
		const onchange = vi.fn();
		render(GroupSelector, {
			props: { title: 'Roles', values: ['Infantry', 'Medical'], selected: ['Infantry'], onchange }
		});

		expect(screen.getByText('1 selected')).toBeTruthy();

		await fireEvent.click(screen.getByRole('checkbox', { name: 'Medical' }));
		expect(onchange).toHaveBeenLastCalledWith(['Infantry', 'Medical']);

		await fireEvent.click(screen.getByRole('button', { name: 'Remove Infantry' }));
		expect(onchange).toHaveBeenLastCalledWith([]);
	});

	it('filters options by search text', async () => {
		render(GroupSelector, {
			props: { title: 'Roles', values: ['Infantry', 'Medical'], selected: [], onchange: vi.fn() }
		});

		await fireEvent.input(screen.getByLabelText('Search roles'), { target: { value: 'med' } });

		expect(screen.getByRole('checkbox', { name: 'Medical' })).toBeTruthy();
		expect(screen.queryByRole('checkbox', { name: 'Infantry' })).toBeNull();
	});
});
