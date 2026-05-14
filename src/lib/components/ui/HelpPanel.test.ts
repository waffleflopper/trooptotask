// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { helpStore } from '$lib/stores/help.svelte';
import HelpPanel from './HelpPanel.svelte';

afterEach(() => {
	helpStore.close();
	cleanup();
});

describe('HelpPanel', () => {
	it('opens the selected help topic in a sheet with accessible title and description', async () => {
		render(HelpPanel);

		expect(screen.queryByRole('dialog')).toBeNull();

		helpStore.open('calendar');

		const dialog = await screen.findByRole('dialog', { name: 'Calendar help' });
		expect(dialog.textContent).toContain('Track availability, holidays, daily assignments, and calendar reporting.');
		expect(dialog.textContent).toContain('Use assignment types for repeatable duties.');
		expect(screen.getByRole('link', { name: /Open full platform guide/i }).getAttribute('href')).toBe('/help');
	});

	it('closes through the sheet close affordance and clears global help state', async () => {
		render(HelpPanel);

		helpStore.open('training');
		expect(await screen.findByRole('dialog', { name: 'Training help' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Close' }));

		await waitFor(() => {
			expect(screen.queryByRole('dialog')).toBeNull();
			expect(helpStore.activeTopic).toBeNull();
		});
	});
});
