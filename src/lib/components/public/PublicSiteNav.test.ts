// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import PublicSiteNav from './PublicSiteNav.svelte';

afterEach(cleanup);

describe('public navigation', () => {
	it('keeps anonymous page, FAQ and access destinations available', () => {
		render(PublicSiteNav, { props: { user: null, showFaqLink: true } });

		expect(screen.getByRole('link', { name: /Troop To Task Unit Readiness Platform/i })).toHaveAttribute('href', '/');
		expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
		expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '/security');
		expect(screen.getByRole('link', { name: 'FAQ' })).toHaveAttribute('href', '/#faq');
		expect(screen.getByRole('link', { name: 'Sign In' })).toHaveAttribute('href', '/auth/login');
		expect(screen.getByRole('link', { name: 'Request Access' })).toHaveAttribute('href', '/auth/request-access');
	});

	it('offers the dashboard to an admitted user', () => {
		render(PublicSiteNav, { props: { user: { id: 'synthetic-user' } } });

		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard?show=all');
		expect(screen.queryByRole('link', { name: 'Sign In' })).not.toBeInTheDocument();
		expect(screen.queryByRole('link', { name: 'Request Access' })).not.toBeInTheDocument();
	});
});
