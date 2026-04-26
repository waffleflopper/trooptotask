// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ToolbarMultiSelectFilter from './ToolbarMultiSelectFilter.svelte';

const trainingTypeOptions = [
	{ value: 'cpr', label: 'CPR' },
	{ value: 'sharp', label: 'SHARP' },
	{ value: 'driver', label: 'Driver Training' }
];

describe('ToolbarMultiSelectFilter', () => {
	afterEach(() => {
		cleanup();
	});

	it('opens a compact filter panel with active selected values', async () => {
		let selected = ['cpr', 'sharp'];
		const onChange = (values: string[]) => {
			selected = values;
		};

		const props = {
			ariaLabel: 'Filter by training type',
			label: 'Training types',
			options: trainingTypeOptions,
			value: selected,
			mode: 'compact' as const,
			onChange
		};
		const { rerender } = render(ToolbarMultiSelectFilter, { props });

		const trigger = screen.getByRole('button', { name: 'Training types: 2 selected' });
		expect(trigger.getAttribute('data-filter-active')).toBe('true');
		expect(screen.getByText('2 selected')).toBeTruthy();
		expect(screen.queryByRole('combobox', { name: 'Filter by training type' })).toBeNull();

		await fireEvent.click(trigger);

		expect(await screen.findByRole('dialog', { name: 'Filter by training type panel' })).toBeTruthy();
		expect(screen.getByText('CPR')).toBeTruthy();
		expect(screen.getByText('SHARP')).toBeTruthy();

		await fireEvent.focus(screen.getByRole('combobox', { name: 'Filter by training type' }));
		await fireEvent.mouseDown(await screen.findByRole('option', { name: 'Driver Training' }));
		expect(selected).toEqual(['cpr', 'sharp', 'driver']);

		await rerender({ ...props, value: selected });
		expect(screen.getByRole('button', { name: 'Training types: 3 selected' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Remove Driver Training' })).toBeTruthy();
	});
});
