// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import BannerPreview from './BannerPreview.svelte';

afterEach(cleanup);

describe('BannerPreview', () => {
	it('shows the banner as people will read it without announcing it as a live message', () => {
		render(BannerPreview, { title: ' Maintenance ', message: 'Down at 2200', type: 'maintenance', expiresAt: null });
		const preview = screen.getByTestId('banner-preview');
		expect(within(preview).getByText('Maintenance')).toBeTruthy();
		expect(within(preview).getByText('Down at 2200')).toBeTruthy();
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.getByText('Shown until you turn it off.')).toBeTruthy();
	});

	it('states when the banner stops showing', () => {
		render(BannerPreview, { title: 'T', message: 'M', type: 'warning', expiresAt: '2026-12-01T15:00:00.000Z' });
		expect(screen.getByText(/^Shown until .*2026/)).toBeTruthy();
	});

	it('offers no working Dismiss control', () => {
		render(BannerPreview, { title: 'T', message: 'M', type: 'info', expiresAt: null });
		expect(within(screen.getByTestId('banner-preview')).getByText('T')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Dismiss' })).toBeNull();
	});
});
