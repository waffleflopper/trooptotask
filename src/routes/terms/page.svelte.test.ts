// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

function renderTermsPage() {
	return render(Page, {
		props: {
			data: { viewer: null, signedIn: false }
		}
	});
}

describe('terms page contact', () => {
	it('states when the terms took effect', () => {
		renderTermsPage();

		expect(screen.getByText(/Effective March 8, 2026/)).toBeTruthy();
	});

	it('links to the canonical support mailbox', () => {
		renderTermsPage();

		expect(screen.getByRole('link', { name: 'support@trooptotask.org' }).getAttribute('href')).toBe(
			'mailto:support@trooptotask.org'
		);
	});

	it('directs account deletion requests to privacy while preserving the support contact', () => {
		renderTermsPage();

		const termination = document.getElementById('termination');
		expect(termination).not.toBeNull();
		expect(within(termination!).getByRole('link', { name: 'privacy@trooptotask.org' }).getAttribute('href')).toBe(
			'mailto:privacy@trooptotask.org'
		);
	});
});
