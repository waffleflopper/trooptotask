// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('admin organization detail page', () => {
	it('shows support-safe billing cancellation diagnostics', () => {
		render(Page, {
			props: {
				data: {
					org: {
						id: 'org-1',
						name: 'Alpha Company',
						subscriptionTier: 'team',
						giftTier: null,
						giftExpiresAt: null,
						suspendedAt: null,
						createdAt: '2026-05-01T00:00:00.000Z',
						effectiveTier: 'team',
						isSuspended: false
					},
					members: [],
					personnelCount: 12,
					auditEvents: [],
					billingSnapshot: {
						stripeCustomerId: 'cus_123',
						stripeSubscriptionId: 'sub_123',
						stripePriceId: 'price_team',
						subscriptionStatus: 'active',
						collectionStatus: 'current',
						syncStatus: 'synced',
						currentPeriodEnd: '2026-06-01T00:00:00.000Z',
						canceledAt: '2026-05-15T00:00:00.000Z',
						lastStripeEventId: 'evt_123',
						lastStripeEventType: 'customer.subscription.updated',
						lastProcessedAt: '2026-05-15T00:01:00.000Z'
					},
					cancellationSummary: {
						state: 'canceling_at_period_end',
						label: 'Cancels at period end',
						description:
							'Paid access remains active until the paid-through date unless Stripe reports an earlier terminal state.',
						currentPeriodEnd: '2026-06-01T00:00:00.000Z',
						canceledAt: '2026-05-15T00:00:00.000Z'
					}
				} as never
			}
		});

		expect(screen.getByText('Billing Diagnostics')).toBeTruthy();
		expect(screen.getByText('cus_123')).toBeTruthy();
		expect(screen.getByText('sub_123')).toBeTruthy();
		expect(screen.getByText('Cancels at period end')).toBeTruthy();
		expect(screen.getByText('customer.subscription.updated')).toBeTruthy();
	});
});
