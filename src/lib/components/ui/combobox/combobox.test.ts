// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
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

	it('focuses the inline input when opening with the mouse and preserves outside-click focus', async () => {
		render(ComboboxMultipleTest);
		const outside = screen.getByRole('button', { name: 'Outside control' });
		outside.focus();
		await fireEvent.click(screen.getByTestId('framework-combobox'));
		await screen.findByRole('listbox');
		const input = screen.getByRole('combobox', { name: 'Frameworks' });
		await waitFor(() => expect(document.activeElement).toBe(input));
		await fireEvent.pointerDown(outside);
		outside.focus();
		await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
		expect(document.activeElement).toBe(outside);
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

	it('searches and toggles multiple values by keyboard without losing input focus', async () => {
		render(ComboboxMultipleTest);
		const input = screen.getByRole('combobox', { name: 'Frameworks' });
		input.focus();
		await screen.findByRole('listbox');
		await fireEvent.input(input, { target: { value: 'Svelte' } });
		await fireEvent.keyDown(input, { key: 'Home' });
		await fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(screen.getByLabelText('Selected frameworks').textContent).toBe('Next.js,SvelteKit'));
		expect(screen.getByRole('listbox')).toBeTruthy();
		expect(document.activeElement).toBe(input);
		await fireEvent.input(input, { target: { value: 'Svelte' } });
		await fireEvent.keyDown(input, { key: 'Home' });
		await fireEvent.keyDown(input, { key: 'Enter' });
		await waitFor(() => expect(screen.getByLabelText('Selected frameworks').textContent).toBe('Next.js'));
		await fireEvent.keyDown(input, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
		expect(document.activeElement).toBe(input);
		await fireEvent.keyDown(input, { key: 'ArrowDown' });
		expect(await screen.findByRole('listbox')).toBeTruthy();
		expect(screen.getByLabelText('Selected frameworks').textContent).toBe('Next.js');
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

	it.each([true, false])(
		'selects an enabled ID by keyboard and restores focus (searchable: %s)',
		async (searchable) => {
			const onValueChange = vi.fn();
			render(ComboboxSingleTest, { searchable, onValueChange });
			const trigger = screen.getByRole('button', { name: 'Person' });
			trigger.focus();
			await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
			await screen.findByRole('listbox');
			await waitFor(() => expect(document.activeElement).not.toBe(trigger));
			await fireEvent.keyDown(document.activeElement!, { key: 'Home' });
			await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
			await fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
			await waitFor(() => expect(screen.getByLabelText('Selected person').textContent).toBe('maya'));
			expect(onValueChange.mock.calls).toEqual([['maya']]);
			await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
			await waitFor(() => expect(document.activeElement).toBe(trigger));
		}
	);

	it('dismisses with Escape without committing and restores trigger focus', async () => {
		const onValueChange = vi.fn();
		render(ComboboxSingleTest, { onValueChange });
		const trigger = screen.getByRole('button', { name: 'Person' });
		trigger.focus();
		await fireEvent.keyDown(trigger, { key: 'Enter' });
		const search = await screen.findByRole('combobox', { name: 'Person' });
		await waitFor(() => expect(document.activeElement).toBe(search));
		await fireEvent.keyDown(search, { key: 'ArrowDown' });
		await fireEvent.keyDown(search, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
		expect(screen.getByLabelText('Selected person').textContent).toBe('');
		expect(onValueChange).not.toHaveBeenCalled();
		await waitFor(() => expect(document.activeElement).toBe(trigger));
	});

	it('dismisses single selection on outside click without stealing focus or committing', async () => {
		const onValueChange = vi.fn();
		render(ComboboxSingleTest, { onValueChange });
		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));
		const search = await screen.findByRole('combobox', { name: 'Person' });
		await waitFor(() => expect(document.activeElement).toBe(search));
		const outside = screen.getByRole('button', { name: 'Outside control' });
		// A native pointer press moves focus before Svelte flushes the close.
		void fireEvent.pointerDown(outside);
		outside.focus();
		await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
		await waitFor(() => expect(document.activeElement).toBe(outside));
		expect(onValueChange).not.toHaveBeenCalled();
	});

	it('does not open or commit when disabled', async () => {
		const onValueChange = vi.fn();
		render(ComboboxSingleTest, { disabled: true, onValueChange });
		const trigger = screen.getByRole('button', { name: 'Person' }) as HTMLButtonElement;
		expect(trigger.disabled).toBe(true);
		await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		await fireEvent.click(trigger);
		expect(screen.queryByRole('listbox')).toBeNull();
		expect(onValueChange).not.toHaveBeenCalled();
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
