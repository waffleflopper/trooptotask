// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import AppDialogTest from './AppDialogTest.svelte';

afterEach(() => cleanup());

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

	it('blocks close affordances while busy', () => {
		render(AppDialogTest, { closeBlocked: true });

		expect(screen.getByRole('dialog', { name: 'Shared dialog title' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
		expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
	});
});
