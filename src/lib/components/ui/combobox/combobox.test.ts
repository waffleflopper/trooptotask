// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import ComboboxMultipleTest from './ComboboxMultipleTest.svelte';
import ComboboxSingleTest from './ComboboxSingleTest.svelte';

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

describe('Combobox single', () => {
	afterEach(() => {
		cleanup();
	});

	it('searches by label and description, selects, and clears a value', async () => {
		render(ComboboxSingleTest);

		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));
		const search = await screen.findByPlaceholderText('Search personnel...');
		await fireEvent.input(search, { target: { value: 'A Co' } });

		const listbox = screen.getByRole('listbox');
		expect(within(listbox).queryByRole('option', { name: /Avery Brooks/ })).toBeNull();
		await fireEvent.click(within(listbox).getByRole('option', { name: /Maya Chen/ }));

		expect(screen.getByLabelText('Selected person').textContent).toBe('maya');
		expect(screen.getByRole('button', { name: 'Person' }).textContent).toContain('Maya Chen');

		await fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
		expect(screen.getByLabelText('Selected person').textContent).toBe('');
	});

	it('shows an empty state when search has no matches', async () => {
		render(ComboboxSingleTest);

		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));
		await fireEvent.input(await screen.findByPlaceholderText('Search personnel...'), {
			target: { value: 'No matching person' }
		});

		expect(await screen.findByText('No people found.')).toBeTruthy();
	});
});
