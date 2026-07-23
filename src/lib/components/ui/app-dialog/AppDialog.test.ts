// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import AppDialogTest from './AppDialogTest.svelte';

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
});

describe('AppDialog', () => {
	it('renders accessible title and description', () => {
		render(AppDialogTest);

		const dialog = screen.getByRole('dialog', { name: 'Shared dialog title' });
		expect(dialog).toBeTruthy();
		expect(screen.getByText('Shared dialog description.')).toBeTruthy();
	});

	it('supports cancel and confirm actions in footer order', async () => {
		render(AppDialogTest);

		const footer = screen.getByTestId('dialog-footer');
		const buttons = Array.from(footer.querySelectorAll('button')).map((button) => button.textContent?.trim());

		expect(buttons).toEqual(['Cancel', 'Confirm']);

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

	it('uses underscore-separated grid tracks so the body row can actually scroll', () => {
		render(AppDialogTest, { longBody: true });

		const contentClass = screen.getByRole('dialog', { name: 'Shared dialog title' }).getAttribute('class') ?? '';
		const gridRows = contentClass.split(/\s+/).find((token) => token.startsWith('grid-rows-['));

		// Tailwind keeps commas literal inside arbitrary values, and a comma-separated
		// track list is invalid CSS the browser drops entirely — leaving the footer
		// clipped behind overflow-hidden instead of the body scrolling.
		expect(gridRows).toBe('grid-rows-[auto_minmax(0,1fr)_auto]');
	});

	it('keeps long content in the scrollable body with a footer', () => {
		render(AppDialogTest, { longBody: true });

		expect(screen.getByText('Scrollable body row 20')).toBeTruthy();
		expect(screen.getByTestId('dialog-body').getAttribute('data-slot')).toBe('app-dialog-body');
		expect(screen.getByTestId('dialog-footer').getAttribute('data-slot')).toBe('app-dialog-footer');
		expect(screen.getByTestId('dialog-body').getAttribute('class')).toContain('overflow-y-auto');
		expect(screen.getByTestId('dialog-footer').getAttribute('class')).not.toContain('sticky');
		expect(screen.getByTestId('dialog-footer').getAttribute('class')).not.toContain('border-t');
	});
});
