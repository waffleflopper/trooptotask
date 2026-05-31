// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';

afterEach(() => {
	cleanup();
});

describe('billing canceled page', () => {
	it('explains checkout cancellation without implying the current subscription was canceled', () => {
		render(Page, {
			props: {
				data: {
					...createReadyAppShellRouteData({ orgId: 'org-route-1' })
				} as never,
				form: null as never,
				params: { orgId: 'org-route-1' }
			}
		});

		expect(screen.getByRole('heading', { name: 'Checkout Not Completed' })).toBeTruthy();
		expect(
			screen.getByText('No payment was completed from this checkout. Your current plan was not canceled or changed.')
		).toBeTruthy();
		expect(
			screen.getByText('Return to Billing when you are ready to choose a plan or review your current subscription.')
		).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Back to Billing' }).getAttribute('href')).toBe('/org/org-route-1/billing');
		expect(screen.getByRole('link', { name: 'Go to Dashboard' }).getAttribute('href')).toBe('/org/org-route-1');
	});
});
