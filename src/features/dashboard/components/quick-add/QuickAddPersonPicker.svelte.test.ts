// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { Personnel } from '$features/personnel/contracts';
import QuickAddPersonPicker from './QuickAddPersonPicker.svelte';

afterEach(cleanup);

const people = [
	{ id: 'p-chen', rank: 'SGT', lastName: 'Chen', firstName: 'Maya' },
	{ id: 'p-brooks', rank: 'SPC', lastName: 'Brooks', firstName: 'Avery' }
] as Personnel[];

function renderPicker(onContinue: (person: Personnel) => void | Promise<void>, ready = true) {
	return render(QuickAddPersonPicker, {
		props: {
			title: 'Add status',
			description: 'Choose who the status is for.',
			people,
			ready,
			failureMessage: 'Could not open the editor.',
			onContinue,
			onClose: vi.fn()
		}
	});
}

describe('QuickAddPersonPicker', () => {
	it('picks a person from the keyboard and continues with them', async () => {
		const onContinue = vi.fn();
		renderPicker(onContinue);
		const dialog = screen.getByRole('dialog', { name: 'Add status' });
		const continueButton = within(dialog).getByRole('button', { name: 'Continue' }) as HTMLButtonElement;
		expect(continueButton.disabled).toBe(true);

		const trigger = within(dialog).getByRole('button', { name: 'Person' });
		trigger.focus();
		await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		const search = await screen.findByRole('combobox', { name: 'Person' });
		await fireEvent.input(search, { target: { value: 'Chen' } });
		await fireEvent.keyDown(search, { key: 'Home' });
		await fireEvent.keyDown(search, { key: 'Enter' });

		await waitFor(() => expect(continueButton.disabled).toBe(false));
		await fireEvent.click(continueButton);
		expect(onContinue.mock.calls.map(([person]) => person.id)).toEqual(['p-chen']);
	});

	it('lists people by last name', async () => {
		renderPicker(vi.fn());
		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));

		const options = within(await screen.findByRole('listbox')).getAllByRole('option');
		expect(options.map((option) => option.textContent?.trim())).toEqual(['SPC Brooks, Avery', 'SGT Chen, Maya']);
	});

	it('keeps Continue off until the extra fields are ready', async () => {
		renderPicker(vi.fn(), false);
		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));
		await fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'SGT Chen, Maya' }));

		expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows a failed continue inline and lets the viewer try again', async () => {
		const onContinue = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
		renderPicker(onContinue);
		await fireEvent.click(screen.getByRole('button', { name: 'Person' }));
		await fireEvent.click(
			within(await screen.findByRole('listbox')).getByRole('option', { name: 'SPC Brooks, Avery' })
		);
		const continueButton = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement;

		await fireEvent.click(continueButton);
		expect((await screen.findByRole('alert')).textContent).toContain('Could not open the editor.');
		await waitFor(() => expect(continueButton.disabled).toBe(false));

		await fireEvent.click(continueButton);
		await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
		expect(onContinue).toHaveBeenCalledTimes(2);
	});
});
