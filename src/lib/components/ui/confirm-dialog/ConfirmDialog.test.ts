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

	it('supports disabled confirm state', () => {
		render(ConfirmDialogTest, { disabled: true });

		expect((screen.getByRole('button', { name: 'Confirm action' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Stand down' }) as HTMLButtonElement).disabled).toBe(false);
	});
});
