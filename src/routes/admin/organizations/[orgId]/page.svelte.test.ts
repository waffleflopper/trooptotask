// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

const planPolicy = {
	source: 'billing_snapshot',
	billingSource: 'stripe',
	entitlements: [
		{
			key: 'advanced_reporting',
			available: false,
			source: 'stripe_billing',
			upgradeTarget: 'unit'
		}
	]
};

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
					adminRole: 'support',
					planPolicy,
					billingSnapshot: {
						stripeCustomerId: 'cus_123',
						stripeSubscriptionId: 'sub_123',
						stripePriceId: 'price_team',
						stripeProductId: 'prod_team',
						source: 'stripe',
						subscriptionStatus: 'active',
						collectionStatus: 'current',
						syncStatus: 'synced',
						currentPeriodEnd: '2026-06-01T00:00:00.000Z',
						canceledAt: '2026-05-15T00:00:00.000Z',
						lastStripeEventId: 'evt_123',
						lastStripeEventType: 'customer.subscription.updated',
						lastProcessedAt: '2026-05-15T00:01:00.000Z',
						lastReconciledAt: '2026-05-23T00:00:00.000Z',
						reconciliationResult: 'repaired_drift:current_period_start,current_period_end,canceled_at',
						driftDetected: false
					},
					cancellationSummary: {
						state: 'canceling_at_period_end',
						label: 'Cancels at period end',
						description:
							'Paid access remains active until the paid-through date unless Stripe reports an earlier terminal state.',
						currentPeriodEnd: '2026-06-01T00:00:00.000Z',
						canceledAt: '2026-05-15T00:00:00.000Z'
					}
				} as never,
				form: null
			}
		});

		expect(screen.getByText('Billing Diagnostics')).toBeTruthy();
		expect(screen.getByText('cus_123')).toBeTruthy();
		expect(screen.getByText('sub_123')).toBeTruthy();
		expect(screen.getByText('prod_team')).toBeTruthy();
		expect(screen.getByText('Stripe')).toBeTruthy();
		expect(screen.getByText('Cancels at period end')).toBeTruthy();
		expect(screen.getByText('customer.subscription.updated')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Refresh from Stripe' })).toBeTruthy();
		const reconciliationResult = screen.getByText('repaired_drift:current_period_start,current_period_end,canceled_at');
		expect(reconciliationResult).toBeTruthy();
		expect(reconciliationResult.className).toContain('min-w-0');
		expect(reconciliationResult.className).toContain('break-all');
	});

	it('shows support-safe manual reconciliation feedback', () => {
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
					adminRole: 'support',
					planPolicy,
					billingSnapshot: null,
					cancellationSummary: null
				} as never,
				form: {
					billingReconciliation: {
						success: false,
						message: 'Stripe subscription is missing orgId metadata.',
						diagnostics: ['missing_org_metadata']
					}
				}
			}
		});

		expect(screen.getByText('Stripe subscription is missing orgId metadata.')).toBeTruthy();
		expect(screen.getByText('missing_org_metadata')).toBeTruthy();
		expect(document.body.textContent).not.toContain('sk_');
	});
});
