// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import ComboboxMultipleTest from './ComboboxMultipleTest.svelte';

describe('Combobox multiple', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders selected values as removable chips', () => {
		render(ComboboxMultipleTest);

		expect(screen.getAllByText('Next.js').length).toBeGreaterThan(0);
		expect(screen.getByRole('button', { name: 'Remove Next.js' })).toBeTruthy();
		expect(screen.getByRole('combobox', { name: 'Frameworks' })).toBeTruthy();
	});

	it('keeps the list open while toggling multiple values', async () => {
		render(ComboboxMultipleTest);

		await fireEvent.focus(screen.getByRole('combobox', { name: 'Frameworks' }));

		const listbox = await screen.findByRole('listbox');
		await fireEvent.click(within(listbox).getByRole('option', { name: 'SvelteKit' }));

		await waitFor(() => {
			expect(screen.getByLabelText('Selected frameworks').textContent).toBe('Next.js,SvelteKit');
		});
		expect(screen.getByRole('listbox')).toBeTruthy();
	});

	it('removes the last selected value with Backspace on an empty input', async () => {
		render(ComboboxMultipleTest);

		const input = screen.getByRole('combobox', { name: 'Frameworks' });
		await fireEvent.keyDown(input, { key: 'Backspace' });

		expect(screen.getByLabelText('Selected frameworks').textContent).toBe('');
	});

	it('closes when the user clicks outside the combobox and stays closed', async () => {
		render(ComboboxMultipleTest);

		await fireEvent.focus(screen.getByRole('combobox', { name: 'Frameworks' }));
		expect(await screen.findByRole('listbox')).toBeTruthy();

		await fireEvent.pointerDown(document.body);

		await waitFor(() => {
			expect(screen.queryByRole('listbox')).toBeNull();
		});
		expect(screen.getByRole('combobox', { name: 'Frameworks' }).getAttribute('aria-expanded')).toBe('false');
	});
});
