// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import FormControlsTest from './form-controls.test.svelte';

describe('shared form controls', () => {
	afterEach(() => {
		cleanup();
	});

	it('wires labels, descriptions, required markers, and validation errors to controls', () => {
		render(FormControlsTest);

		const title = screen.getByRole('textbox', { name: /task title/i });
		expect(title.getAttribute('aria-describedby')).toBe('task-title-description');
		expect(title.hasAttribute('required')).toBe(true);
		expect(screen.getByText('*')).toBeTruthy();

		const notes = screen.getByRole('textbox', { name: /notes/i });
		expect(notes.getAttribute('aria-invalid')).toBe('true');
		expect(notes.getAttribute('aria-describedby')).toBe('task-notes-error');
		expect(screen.getByText('Notes are too short.')).toBeTruthy();
	});

	it('supports controlled input, textarea, checkbox, switch, and disabled states', async () => {
		render(FormControlsTest);

		await fireEvent.input(screen.getByRole('textbox', { name: /task title/i }), {
			target: { value: 'Updated task' }
		});
		await fireEvent.input(screen.getByRole('textbox', { name: /notes/i }), {
			target: { value: 'Updated notes' }
		});
		await fireEvent.click(screen.getByRole('checkbox', { name: /include archived records/i }));
		await fireEvent.click(screen.getByRole('switch', { name: /approval required/i }));

		expect(screen.getByLabelText('Current values').textContent).toContain('Updated task|Updated notes');
		expect(screen.getByLabelText('Current values').textContent).toContain('|true|false');
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
