// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import PublicCta from './PublicCta.svelte';

afterEach(cleanup);

describe('public access CTA', () => {
	it('sends a visitor to reviewed access', () => {
		render(PublicCta, { props: { user: null } });
		expect(screen.getByRole('link', { name: 'Request Access' })).toHaveAttribute('href', '/auth/request-access');
	});

	it('sends an admitted user to the dashboard', () => {
		render(PublicCta, { props: { user: { id: 'synthetic-user' } } });
		expect(screen.getByRole('link', { name: 'Go to Dashboard' })).toHaveAttribute('href', '/dashboard?show=all');
		expect(screen.queryByRole('link', { name: 'Request Access' })).not.toBeInTheDocument();
	});
});
