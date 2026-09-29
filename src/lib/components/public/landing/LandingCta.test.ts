// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import LandingCta from './LandingCta.svelte';

afterEach(cleanup);

describe('landing closing ask', () => {
	it('sends a visitor to reviewed access and offers no dashboard', () => {
		render(LandingCta, { props: { signedIn: false } });

		expect(screen.getByRole('link', { name: /request access/i })).toHaveAttribute('href', '/auth/request-access');
		expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument();
	});

	it('sends a signed-in user to the dashboard instead of the access request', () => {
		render(LandingCta, { props: { signedIn: true } });

		expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard?show=all');
		expect(screen.queryByRole('link', { name: /request access/i })).not.toBeInTheDocument();
	});
});
