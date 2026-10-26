// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import PublicSiteNav from './PublicSiteNav.svelte';

afterEach(cleanup);

describe('public navigation', () => {
	it('keeps anonymous page, section and access destinations available', () => {
		render(PublicSiteNav, { props: { signedIn: false } });

		expect(screen.getByRole('link', { name: 'TroopToTask' })).toHaveAttribute('href', '/');
		expect(screen.getByRole('link', { name: 'Platform' })).toHaveAttribute('href', '/#platform');
		expect(screen.getByRole('link', { name: "What's next" })).toHaveAttribute('href', '/#whats-next');
		expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '/security');
		expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/#faq');
		expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
		expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/auth/login');
		expect(screen.getByRole('link', { name: 'Request Access' })).toHaveAttribute('href', '/auth/request-access');
	});

	it('offers the dashboard to an admitted user', () => {
		render(PublicSiteNav, { props: { signedIn: true } });

		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard?show=all');
		expect(screen.queryByRole('link', { name: 'Sign In' })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Request Access' })).not.toBeInTheDocument();
	});

	it('marks only the current page in the navigation', () => {
		render(PublicSiteNav, { props: { signedIn: false, active: 'security' } });

		expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('aria-current', 'page');
		expect(screen.getByRole('link', { name: 'About' })).not.toHaveAttribute('aria-current');
	});
});
