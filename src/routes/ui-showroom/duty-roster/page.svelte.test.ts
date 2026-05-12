// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('/ui-showroom/duty-roster', () => {
	it('renders the duty roster composition showroom', () => {
		render(Page);

		expect(screen.getByRole('heading', { name: 'Duty Roster Composition Showroom' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Template register' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'New template wizard, pool step' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Generate setup and preview review' })).toBeTruthy();
	});

	it('switches to history and settings examples', async () => {
		render(Page);

		await fireEvent.click(screen.getByRole('tab', { name: 'History' }));
		expect(screen.getByRole('heading', { name: 'Staff Duty NCO, History' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'History Detail' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('tab', { name: 'Settings' }));
		expect(screen.getByRole('heading', { name: 'Staff Duty NCO' })).toBeTruthy();
		expect(screen.getByText('Settings affect future runs only.')).toBeTruthy();
	});

	it('opens the manual change and correction sheets', async () => {
		render(Page);

		await fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
		let dialog = screen.getByRole('dialog');
		expect(within(dialog).getByRole('heading', { name: 'Manual Preview Change' })).toBeTruthy();

		await fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
		await fireEvent.click(screen.getByRole('tab', { name: 'History' }));
		await fireEvent.click(screen.getByRole('button', { name: /Open correction for May 14/ }));
		dialog = screen.getByRole('dialog');
		expect(within(dialog).getByRole('heading', { name: 'Duty Roster Correction' })).toBeTruthy();
	});

	it('renders the DA6 matrix example', async () => {
		render(Page);

		await fireEvent.click(screen.getByRole('tab', { name: 'DA6 Matrix' }));
		expect(screen.getByRole('heading', { name: 'Preview Review, DA6 Matrix (Draft)' })).toBeTruthy();
		expect(screen.getByRole('table', { name: 'Preview Review, DA6 Matrix (Draft)' })).toBeTruthy();
		expect(screen.getAllByText('X').length).toBeGreaterThan(0);
		expect(screen.getAllByText('A').length).toBeGreaterThan(0);
		expect(screen.getAllByText('D').length).toBeGreaterThan(0);
		expect(screen.getAllByText('U').length).toBeGreaterThan(0);
		expect(screen.getByText('Authorized absence or exempt; not chargeable.')).toBeTruthy();
		expect(screen.getByText('Blocked but chargeable; count advances.')).toBeTruthy();
	});
});
