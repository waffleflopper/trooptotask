// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('privacy page contact', () => {
	it('keeps the shared wordmark as a home link on public pages', () => {
		render(Page, { props: { data: { session: null, user: null } } });
		expect(screen.getByRole('link', { name: /Troop To Task Unit Readiness Platform/i })).toHaveAttribute('href', '/');
	});

	it('offers staff-assisted account deletion through the privacy mailbox', () => {
		render(Page, {
			props: {
				data: { session: null, user: null }
			}
		});

		const deletionRequest = screen.getByText(/To request account deletion/i);
		expect(within(deletionRequest).getByRole('link', { name: 'privacy@trooptotask.org' })).toHaveAttribute(
			'href',
			'mailto:privacy@trooptotask.org'
		);
	});
});
