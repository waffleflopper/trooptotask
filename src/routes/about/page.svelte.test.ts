// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(cleanup);

describe('about page access links', () => {
	it('offers reviewed access to a visitor', () => {
		render(Page, { props: { data: { viewer: null, signedIn: false } } });

		const requests = screen.getAllByRole('link', { name: 'Request Access' });
		expect(requests.length).toBeGreaterThan(0);
		for (const link of requests) expect(link.getAttribute('href')).toBe('/auth/request-access');
		expect(screen.queryByRole('link', { name: 'Go to Dashboard' })).toBeNull();
	});

	it('sends a signed-in member to the dashboard instead of the access request', () => {
		render(Page, { props: { data: { viewer: null, signedIn: true } } });

		expect(screen.getByRole('link', { name: 'Go to Dashboard' }).getAttribute('href')).toBe('/dashboard?show=all');
		expect(screen.getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/dashboard?show=all');
		expect(screen.queryByRole('link', { name: 'Request Access' })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Sign In' })).toBeNull();
	});
});
