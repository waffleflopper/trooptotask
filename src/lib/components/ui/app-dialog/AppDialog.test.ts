// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import AppDialogTest from './AppDialogTest.svelte';

afterEach(() => cleanup());

async function clickOutside() {
	const outside = screen.getByRole('button', { name: 'Open test dialog' });
	const point = { clientX: 5, clientY: 5 };
	await fireEvent.pointerDown(outside, point);
	await fireEvent.pointerUp(outside, point);
	await fireEvent.click(outside, point);
	await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('AppDialog', () => {
	it('renders accessible title and description', () => {
		render(AppDialogTest);

		const dialog = screen.getByRole('dialog', { name: 'Shared dialog title' });
		expect(dialog).toBeTruthy();
		expect(screen.getByText('Shared dialog description.')).toBeTruthy();
	});

	it('supports cancel and confirm actions', async () => {
		render(AppDialogTest);

		await fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
		expect(screen.getByTestId('confirmed-count').textContent).toBe('1');

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		await waitFor(() => {
			expect(screen.queryByRole('dialog')).toBeNull();
			expect(screen.getByTestId('closed-count').textContent).toBe('1');
		});
	});

	it('opens and closes through controlled state', async () => {
		render(AppDialogTest, { initialOpen: false });

		expect(screen.queryByRole('dialog')).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Open test dialog' }));
		expect(screen.getByRole('dialog', { name: 'Shared dialog title' })).toBeTruthy();
	});

	it('closes on Escape and on an outside click when idle', async () => {
		render(AppDialogTest);

		await clickOutside();
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

		await fireEvent.click(screen.getByRole('button', { name: 'Open test dialog' }));
		await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(screen.getByTestId('closed-count').textContent).toBe('2');
	});

	it('keeps focus inside and blocks Escape and outside click while busy', async () => {
		render(AppDialogTest);
		const dialog = screen.getByRole('dialog', { name: 'Shared dialog title' });
		const save = screen.getByRole('button', { name: 'Save slowly' });
		save.focus();

		await fireEvent.click(save);

		expect(dialog.getAttribute('aria-busy')).toBe('true');
		expect(document.activeElement).toBe(dialog);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await clickOutside();
		expect(screen.getByRole('dialog', { name: 'Shared dialog title' })).toBe(dialog);
		expect(screen.getByTestId('closed-count').textContent).toBe('0');

		await fireEvent.click(screen.getByRole('button', { name: 'Finish work' }));
		expect(dialog.hasAttribute('aria-busy')).toBe(false);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('keeps focus inside when a dialog that is not busy disables its focused button', async () => {
		render(AppDialogTest);
		const dialog = screen.getByRole('dialog', { name: 'Shared dialog title' });
		const submit = screen.getByRole('button', { name: 'Submit once' });
		submit.focus();

		await fireEvent.click(submit);
		await new Promise((resolve) => setTimeout(resolve));

		expect((submit as HTMLButtonElement).disabled).toBe(true);
		expect(document.activeElement).toBe(dialog);
		expect(dialog.hasAttribute('aria-busy')).toBe(false);
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
	});

	it('blocks closing a draft without announcing busy work', async () => {
		render(AppDialogTest);
		const dialog = screen.getByRole('dialog', { name: 'Shared dialog title' });

		await fireEvent.input(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'Unsaved' } });

		expect(dialog.hasAttribute('aria-busy')).toBe(false);
		expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await clickOutside();
		expect(screen.getByRole('dialog', { name: 'Shared dialog title' })).toBe(dialog);

		const save = screen.getByRole('button', { name: 'Save slowly' });
		save.focus();
		await fireEvent.click(save);
		expect(dialog.getAttribute('aria-busy')).toBe('true');
		await waitFor(() => expect(document.activeElement).toBe(dialog));
	});

	it('blocks close affordances while busy', () => {
		render(AppDialogTest, { initialBusy: true });

		expect(screen.getByRole('dialog', { name: 'Shared dialog title' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
		expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('fills the screen below 640 px when presented as a sheet', () => {
		render(AppDialogTest, { presentation: 'sheet' });
		const sheet = screen.getByRole('dialog', { name: 'Shared dialog title' });
		expect(sheet.classList.contains('data-[side=right]:max-sm:w-full')).toBe(true);
	});

	it('presents as a side sheet with the same draft protection', async () => {
		render(AppDialogTest, { presentation: 'sheet' });
		const sheet = screen.getByRole('dialog', { name: 'Shared dialog title' });

		await fireEvent.input(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'Unsaved' } });
		await fireEvent.keyDown(sheet, { key: 'Escape' });
		await clickOutside();
		expect(screen.getByRole('dialog', { name: 'Shared dialog title' })).toBe(sheet);
		expect(screen.getByTestId('closed-count').textContent).toBe('0');
	});
});
