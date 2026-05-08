// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ConfirmDialogTest from './ConfirmDialogTest.svelte';

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
});

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

		await waitFor(() => {
			expect((screen.getByRole('button', { name: 'Stand down' }) as HTMLButtonElement).disabled).toBe(false);
		});
	});

	it('supports disabled confirm state', () => {
		render(ConfirmDialogTest, { disabled: true });

		expect((screen.getByRole('button', { name: 'Confirm action' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'Stand down' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('supports destructive and warning semantics', () => {
		const { unmount } = render(ConfirmDialogTest, { variant: 'destructive' });
		expect(screen.getByRole('button', { name: 'Confirm action' }).getAttribute('class')).toContain('destructive');
		expect(
			screen.getByRole('alertdialog').querySelector('[data-slot="alert-dialog-footer"]')?.getAttribute('class')
		).not.toContain('border-t');
		unmount();

		render(ConfirmDialogTest, { variant: 'warning' });
		expect(screen.getByRole('button', { name: 'Confirm action' }).getAttribute('class')).toContain('bg-primary');
		expect(screen.getByRole('button', { name: 'Confirm action' }).getAttribute('class')).not.toContain('warning');
		expect(
			screen.getByRole('alertdialog').querySelector('[data-slot="alert-dialog-footer"]')?.getAttribute('class')
		).not.toContain('border-t');
	});

	it('orders cancel before confirm in the footer', () => {
		render(ConfirmDialogTest);

		const buttons = screen.getAllByRole('button').map((button) => button.textContent?.trim());
		expect(buttons).toEqual(['Open confirm dialog', 'Stand down', 'Confirm action']);
	});
});
