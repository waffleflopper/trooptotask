// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('/ui-showroom/calendar', () => {
	it('renders the mock production-style month calendar and navigates months', async () => {
		render(Page);

		expect(screen.getByRole('heading', { name: 'May 2026' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Personnel' })).toBeTruthy();
		expect(screen.getByRole('rowheader', { name: /Dawson, Caleb/ })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: /Next/ }));

		expect(screen.getByRole('heading', { name: 'June 2026' })).toBeTruthy();
	});

	it('opens the add status dialog from a matrix cell selection', async () => {
		render(Page);

		await fireEvent.click(screen.getByRole('button', { name: /Simmons, Ryan, May 2026 8/ }));

		const dialog = screen.getByRole('dialog');
		expect(within(dialog).getByRole('heading', { name: 'Add Status' })).toBeTruthy();
		expect(within(dialog).getByText(/SGT Simmons, Ryan on May 2026 8/)).toBeTruthy();
	});

	it('opens daily duties from a date header and switches to long-range view', async () => {
		render(Page);

		await fireEvent.click(screen.getByRole('button', { name: 'Open duties for May 2026 8' }));

		expect(screen.getByRole('heading', { name: 'Daily Duties' })).toBeTruthy();
		expect(screen.getByText('Battalion staff duty')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Close daily duties' }));
		await fireEvent.click(screen.getByRole('button', { name: '3-Month' }));

		expect(screen.getByRole('heading', { name: 'May 2026 - July 2026' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Prev 3 Months' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'JUNE 2026' })).toBeTruthy();
	});
});
