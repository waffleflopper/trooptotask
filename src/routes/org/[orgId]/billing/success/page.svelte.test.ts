// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';
import type { CheckoutSuccessStatus } from './+page.server';

afterEach(() => {
	cleanup();
});

function renderPage(checkoutStatus: CheckoutSuccessStatus) {
	render(Page, {
		props: {
			data: {
				orgId: 'org-route-1',
				checkoutStatus
			} as never,
			form: null as never,
			params: { orgId: 'org-route-1' }
		}
	});
}

const activeStatus: CheckoutSuccessStatus = {
	state: 'active',
	eyebrow: 'Billing update',
	title: 'Plan Active',
	description: 'Your plan is active. The new limits are available for this organization.',
	detail: 'You can review plan details, invoices, and payment settings from Billing.'
};

describe('billing success page', () => {
	it('shows active checkout success copy and correct route links', () => {
		renderPage(activeStatus);

		expect(screen.getByRole('heading', { name: 'Plan Active' })).toBeTruthy();
		expect(screen.getByText('Your plan is active. The new limits are available for this organization.')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'View Billing' }).getAttribute('href')).toBe('/org/org-route-1/billing');
		expect(screen.getByRole('link', { name: 'Go to Dashboard' }).getAttribute('href')).toBe('/org/org-route-1');
	});

	it('shows pending checkout confirmation copy without internal payment-provider jargon', () => {
		renderPage({
			state: 'pending',
			eyebrow: 'Billing update',
			title: 'Checkout Received',
			description: 'Checkout finished, and TroopToTask is confirming the plan update.',
			detail: 'This usually updates shortly. Open Billing to check the latest status.'
		});

		expect(screen.getByRole('heading', { name: 'Checkout Received' })).toBeTruthy();
		expect(screen.getByText('Checkout finished, and TroopToTask is confirming the plan update.')).toBeTruthy();
		expect(screen.queryByText(/Stripe|webhook|session/i)).toBeNull();
	});

	it('shows payment recovery copy when checkout payment is incomplete', () => {
		renderPage({
			state: 'payment_incomplete',
			eyebrow: 'Billing update',
			title: 'Payment Needs Attention',
			description: 'Checkout was started, but payment is not complete yet.',
			detail: 'Open Billing to update payment details or try again. Your current data remains available.'
		});

		expect(screen.getByRole('heading', { name: 'Payment Needs Attention' })).toBeTruthy();
		expect(screen.getByText('Checkout was started, but payment is not complete yet.')).toBeTruthy();
	});

	it('shows still-updating copy when the billing record has not caught up', () => {
		renderPage({
			state: 'still_syncing',
			eyebrow: 'Billing update',
			title: 'Billing Is Still Updating',
			description: 'Checkout returned to TroopToTask, but the billing record has not finished updating yet.',
			detail: 'Open Billing to refresh the status or return to the dashboard while it catches up.'
		});

		expect(screen.getByRole('heading', { name: 'Billing Is Still Updating' })).toBeTruthy();
		expect(
			screen.getByText('Checkout returned to TroopToTask, but the billing record has not finished updating yet.')
		).toBeTruthy();
	});
});
