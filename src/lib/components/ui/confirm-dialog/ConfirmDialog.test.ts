// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ConfirmDialogTest from './ConfirmDialogTest.svelte';

afterEach(() => cleanup());

describe('ConfirmDialog', () => {
	it('renders accessible title and description', () => {
		render(ConfirmDialogTest);

		expect(screen.getByRole('alertdialog', { name: 'Confirm shared action' })).toBeTruthy();
		expect(screen.getByText('This explains the consequence.')).toBeTruthy();
	});

	it('runs cancel and confirm actions', async () => {
		render(ConfirmDialogTest);

		await fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
		expect(screen.getByTestId('confirm-count').textContent).toBe('1');

		await fireEvent.click(screen.getByRole('button', { name: 'Stand down' }));
		await waitFor(() => {
			expect(screen.queryByRole('alertdialog')).toBeNull();
			expect(screen.getByTestId('cancel-count').textContent).toBe('1');
		});
	});

	it('offers a third choice that runs on its own and leaves the other two alone', async () => {
		render(ConfirmDialogTest, { alternate: true });

		await fireEvent.click(screen.getByRole('button', { name: 'Other action' }));

		expect(screen.getByTestId('alternate-count').textContent).toBe('1');
		expect(screen.getByTestId('confirm-count').textContent).toBe('0');
		expect(screen.getByTestId('cancel-count').textContent).toBe('0');
	});

	it('shows no third choice unless one is labelled', () => {
		render(ConfirmDialogTest);

		expect(screen.queryByRole('button', { name: 'Other action' })).toBeNull();
	});

	it('shows async confirm loading state and blocks cancel while busy', async () => {
		render(ConfirmDialogTest, { asyncConfirm: true });

		await fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));

		expect((screen.getByRole('button', { name: /Confirm action/ }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Stand down' }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole('alertdialog', { name: 'Confirm shared action' })).toBeTruthy();

		await fireEvent.keyDown(document, { key: 'Escape' });
		expect(screen.getByRole('alertdialog', { name: 'Confirm shared action' })).toBeTruthy();
		expect(screen.getByTestId('cancel-count').textContent).toBe('0');

		await waitFor(() => {
			expect((screen.getByRole('button', { name: 'Stand down' }) as HTMLButtonElement).disabled).toBe(false);
		});
	});

	it('keeps focus inside and marks the dialog busy while confirming', async () => {
		render(ConfirmDialogTest, { asyncConfirm: true });
		const dialog = screen.getByRole('alertdialog', { name: 'Confirm shared action' });
		const confirm = screen.getByRole('button', { name: 'Confirm action' });
		confirm.focus();

		await fireEvent.click(confirm);

		expect(dialog.getAttribute('aria-busy')).toBe('true');
		expect(document.activeElement).toBe(dialog);

		await waitFor(() => expect(dialog.hasAttribute('aria-busy')).toBe(false));
		expect(document.activeElement).toBe(dialog);
	});

	it('ignores an outside click and cancels on Escape with focus back on the opener', async () => {
		render(ConfirmDialogTest);
		await fireEvent.click(screen.getByRole('button', { name: 'Stand down' }));
		const opener = screen.getByRole('button', { name: 'Open confirm dialog' });
		opener.focus();
		await fireEvent.click(opener);
		const dialog = await screen.findByRole('alertdialog', { name: 'Confirm shared action' });

		const point = { clientX: 5, clientY: 5 };
		await fireEvent.pointerDown(opener, point);
		await fireEvent.pointerUp(opener, point);
		await fireEvent.click(opener, point);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(screen.getByRole('alertdialog', { name: 'Confirm shared action' })).toBe(dialog);
		expect(screen.getByTestId('cancel-count').textContent).toBe('1');

		await fireEvent.keyDown(dialog, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
		expect(screen.getByTestId('cancel-count').textContent).toBe('2');
		await waitFor(() => expect(document.activeElement).toBe(opener));
	});

	it('supports disabled confirm state', () => {
		render(ConfirmDialogTest, { disabled: true });

		expect((screen.getByRole('button', { name: 'Confirm action' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Stand down' }) as HTMLButtonElement).disabled).toBe(false);
	});
});
