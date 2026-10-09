// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import FormControlsTest from './form-controls.test.svelte';

describe('shared form controls', () => {
	afterEach(() => {
		cleanup();
	});

	function descriptionText(control: HTMLElement) {
		return (control.getAttribute('aria-describedby') ?? '')
			.split(' ')
			.filter(Boolean)
			.map((id) => document.getElementById(id)?.textContent?.trim());
	}

	it('associates field descriptions and errors with each contained control', async () => {
		render(FormControlsTest);

		const title = screen.getByRole('textbox', { name: /task title/i });
		expect(descriptionText(title)).toEqual(['Use the official task name.']);
		expect(title.getAttribute('aria-invalid')).toBeNull();
		expect(title.hasAttribute('required')).toBe(true);
		expect(screen.getByText('*')).toBeTruthy();

		const nativeStatus = screen.getByRole('combobox', { name: /native status/i });
		expect(nativeStatus.getAttribute('aria-describedby')).toBe('native-status-help');

		const customStatus = screen.getByRole('button', { name: /custom status/i });
		expect(descriptionText(customStatus)).toEqual(['Choose a reviewed status.']);
		expect(customStatus.getAttribute('aria-invalid')).toBe('true');

		const person = screen.getByRole('button', { name: /person/i });
		expect(descriptionText(person)).toEqual(['Search by last name.']);
		await fireEvent.click(person);
		const search = await screen.findByPlaceholderText('Search people');
		expect(search.getAttribute('aria-describedby')).toBeNull();
	});

	it('marks a control invalid only while its field shows an error', async () => {
		render(FormControlsTest);

		const notes = screen.getByRole('textbox', { name: /notes/i });
		expect(notes.getAttribute('aria-invalid')).toBe('true');
		expect(descriptionText(notes)).toEqual(['Notes are too short.']);

		await fireEvent.input(notes, { target: { value: 'Long enough notes' } });

		expect(screen.queryByText('Notes are too short.')).toBeNull();
		expect(notes.getAttribute('aria-invalid')).toBeNull();
		expect(notes.getAttribute('aria-describedby')).toBeNull();
	});

	it('supports controlled input, textarea, checkbox, and disabled states', async () => {
		render(FormControlsTest);

		await fireEvent.input(screen.getByRole('textbox', { name: /task title/i }), {
			target: { value: 'Updated task' }
		});
		await fireEvent.input(screen.getByRole('textbox', { name: /notes/i }), {
			target: { value: 'Updated notes' }
		});
		await fireEvent.click(screen.getByRole('checkbox', { name: /include archived records/i }));

		expect(screen.getByLabelText('Current values').textContent).toContain('Updated task|Updated notes');
		expect(screen.getByLabelText('Current values').textContent?.trim()).toMatch(/\|true$/);
		expect(screen.getByRole('textbox', { name: /disabled field/i }).hasAttribute('disabled')).toBe(true);
	});

	it('supports native select value changes', async () => {
		render(FormControlsTest);

		const nativeStatus = screen.getByRole('combobox', { name: /native status/i }) as HTMLSelectElement;

		await fireEvent.change(nativeStatus, {
			target: { value: 'watch' }
		});

		await waitFor(() => {
			expect(nativeStatus.value).toBe('watch');
			expect(screen.getByLabelText('Current values').textContent).toContain('|watch|');
		});
	});

	it('supports shadcn select option disclosure', async () => {
		render(FormControlsTest);

		await fireEvent.click(screen.getByRole('button', { name: /custom status/i }));

		expect(await screen.findByRole('option', { name: /action required/i })).toBeTruthy();
	});

	it('supports combobox selection and clearing', async () => {
		render(FormControlsTest);

		await fireEvent.click(screen.getByRole('button', { name: /person/i }));
		await fireEvent.click(await screen.findByRole('option', { name: /maya chen/i }));

		await waitFor(() => {
			expect(screen.getByLabelText('Current values').textContent).toContain('|maya|');
			expect((document.querySelector('input[name="personId"]') as HTMLInputElement).value).toBe('maya');
		});

		await fireEvent.click(screen.getByLabelText('Clear selection'));

		await waitFor(() => {
			expect(screen.getByLabelText('Current values').textContent).toContain('||hq|');
		});
	});

	it('supports multi-select add, remove, selected count, hidden inputs, no-results, and keyboard backspace behavior', async () => {
		render(FormControlsTest);

		const toolbar = screen.getByRole('toolbar', { name: /shared form toolbar/i });
		const input = within(toolbar).getByRole('combobox', { name: /groups/i });
		expect(screen.getByTestId('selected-count').textContent).toBe('1 selected');
		expect(
			Array.from(document.querySelectorAll('input[name="groupIds"]')).map((input) => (input as HTMLInputElement).value)
		).toEqual(['hq']);

		await fireEvent.focus(input);
		await fireEvent.click(await screen.findByRole('option', { name: /a co/i }));
		expect(screen.getByTestId('selected-count').textContent).toBe('2 selected');
		expect(screen.getByRole('button', { name: /remove a co/i })).toBeTruthy();
		expect(
			Array.from(document.querySelectorAll('input[name="groupIds"]')).map((input) => (input as HTMLInputElement).value)
		).toEqual(['hq', 'a-co']);

		await fireEvent.click(screen.getByRole('button', { name: /remove a co/i }));
		expect(screen.getByTestId('selected-count').textContent).toBe('1 selected');

		await fireEvent.input(input, { target: { value: 'missing' } });
		expect(await screen.findByText('No groups found.')).toBeTruthy();

		await fireEvent.input(input, { target: { value: '' } });
		await fireEvent.keyDown(input, { key: 'Backspace' });
		expect(screen.getByTestId('selected-count').textContent).toBe('0 selected');
	});

	it('supports grouped, disabled, and loading option states', async () => {
		render(FormControlsTest);

		await fireEvent.click(screen.getByRole('button', { name: /person/i }));
		expect(await screen.findByText('Line companies')).toBeTruthy();
		expect((await screen.findByRole('option', { name: /jon bell/i })).getAttribute('aria-disabled')).toBe('true');

		await fireEvent.click(screen.getByRole('button', { name: /loading people/i }));
		expect(await screen.findByText('Loading personnel...')).toBeTruthy();
	});
});
