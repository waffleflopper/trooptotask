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

	it.each([
		{ removed: 'Medical', focused: 'Remove Signal' },
		{ removed: 'Signal', focused: 'Remove Medical' }
	])('moves focus from the removed $removed chip to $focused', async ({ removed, focused }) => {
		const onchange = vi.fn();
		const values = ['Infantry', 'Medical', 'Signal'];
		const { rerender } = render(GroupSelector, {
			props: { title: 'Roles', values, selected: ['Medical', 'Signal'], onchange }
		});

		await fireEvent.click(screen.getByRole('button', { name: `Remove ${removed}` }));
		await rerender({ title: 'Roles', values, selected: onchange.mock.lastCall![0], onchange });

		expect(document.activeElement).toBe(screen.getByRole('button', { name: focused }));
	});

	it('moves focus to the search field when the last chip is removed', async () => {
		const onchange = vi.fn();
		const values = ['Infantry', 'Medical'];
		const { rerender } = render(GroupSelector, {
			props: { title: 'Roles', values, selected: ['Medical'], onchange }
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Remove Medical' }));
		await rerender({ title: 'Roles', values, selected: [], onchange });

		expect(document.activeElement).toBe(screen.getByLabelText('Search roles'));
	});
});
