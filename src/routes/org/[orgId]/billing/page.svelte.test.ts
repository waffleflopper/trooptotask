// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const baseData = {
	orgId: 'org-1',
	orgName: 'Test Org',
	canManageSubscription: true,
	effectiveTier: {
		tier: 'team',
		source: 'subscription',
		personnelCount: 12,
		personnelCap: 75,
		isReadOnly: false,
		readOnlyReason: null,
		giftExpiresAt: null,
		giftTier: null
	},
	billingSnapshot: {
		organizationId: 'org-1',
		source: 'stripe',
		commercialPlan: 'team',
		stripeCustomerId: 'cus_123',
		stripeSubscriptionId: 'sub_123',
		stripeProductId: 'prod_team',
		stripePriceId: 'price_team',
		subscriptionStatus: 'active',
		collectionStatus: 'current',
		currentPeriodStart: '2026-05-01T00:00:00.000Z',
		currentPeriodEnd: '2026-06-01T00:00:00.000Z',
		cancelAtPeriodEnd: false,
		canceledAt: null,
		trialEnd: null,
		syncStatus: 'synced',
		lastStripeEventId: 'evt_123',
		lastStripeEventType: 'customer.subscription.updated',
		lastStripeEventCreatedAt: '2026-05-01T00:00:00.000Z',
		lastProcessedAt: '2026-05-01T00:00:01.000Z',
		lastReconciledAt: null,
		reconciliationResult: null,
		driftDetected: false,
		giftTier: null,
		giftExpiresAt: null
	},
	tierComparison: [
		{
			tier: 'free',
			name: 'Free',
			personnelCap: 20,
			maxOrgsOwned: 1,
			bulkExportsPerMonth: 1,
			priceMonthly: 0
		},
		{
			tier: 'team',
			name: 'Team',
			personnelCap: 80,
			maxOrgsOwned: 1,
			bulkExportsPerMonth: null,
			priceMonthly: 500
		},
		{
			tier: 'unit',
			name: 'Unit',
			personnelCap: 500,
			maxOrgsOwned: 3,
			bulkExportsPerMonth: null,
			priceMonthly: 1200
		}
	],
	cancellationSummary: {
		state: 'none',
		label: 'Not scheduled',
		description: 'No cancellation is currently scheduled in the billing snapshot.',
		currentPeriodEnd: null,
		canceledAt: null
	}
};

describe('billing page toolbar', () => {
	it.each([
		['active', 'Subscription active.', 'Use Manage Subscription for invoices'],
		['trialing', 'Trial active.', 'review payment details before the trial ends'],
		['past_due', 'Payment failed. Grace access is active.', 'update the payment method'],
		['unpaid', 'Payment required to restore paid access.', 'recover service'],
		['canceled', 'Subscription canceled.', 'start a new checkout'],
		['incomplete', 'Payment is pending.', 'Complete checkout'],
		['incomplete_expired', 'Checkout expired.', 'start a new checkout'],
		['paused', 'Subscription paused.', 'Open the billing portal']
	])('shows owner-safe status copy for %s subscriptions', (subscriptionStatus, title, detail) => {
		render(Page, {
			props: {
				data: {
					...baseData,
					billingSnapshot: {
						...baseData.billingSnapshot,
						subscriptionStatus
					}
				} as never
			}
		});

		expect(screen.getByText(title)).toBeTruthy();
		expect(screen.getByText(new RegExp(detail))).toBeTruthy();
	});

	it('uses the effective tier when past-due access has already been downgraded', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					effectiveTier: {
						...baseData.effectiveTier,
						tier: 'free',
						isReadOnly: true,
						readOnlyReason: 'billing_state'
					},
					billingSnapshot: {
						...baseData.billingSnapshot,
						subscriptionStatus: 'past_due'
					}
				} as never
			}
		});

		expect(screen.getByText('Payment failed. Paid access has been suspended.')).toBeTruthy();
		expect(screen.getByText(/downgraded to the free plan/)).toBeTruthy();
	});

	it('shows owner-visible drift health when reconciliation found drift', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					billingSnapshot: {
						...baseData.billingSnapshot,
						driftDetected: true
					}
				} as never
			}
		});

		expect(screen.getByText('Needs support review')).toBeTruthy();
	});

	it('shows gifted billing source copy without payment recovery pressure', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					effectiveTier: {
						...baseData.effectiveTier,
						source: 'gift',
						giftTier: 'team',
						giftExpiresAt: '2026-07-01T00:00:00.000Z'
					}
				} as never
			}
		});

		expect(screen.getByText('Gifted access is active.')).toBeTruthy();
		expect(screen.getAllByText(/outside Stripe billing/).length).toBeGreaterThan(0);
	});

	it('shows billing-disabled fallback state and hides Stripe recovery actions', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					canManageSubscription: true,
					effectiveTier: {
						...baseData.effectiveTier,
						tier: 'unit',
						source: 'billing_disabled'
					},
					billingSnapshot: {
						...baseData.billingSnapshot,
						source: 'billing_disabled',
						commercialPlan: 'unit',
						subscriptionStatus: null,
						syncStatus: 'billing_disabled'
					}
				} as never
			}
		});

		expect(screen.getByText('Billing is disabled in this environment.')).toBeTruthy();
		expect(screen.queryByRole('toolbar', { name: 'Billing controls' })).toBeNull();
		expect(screen.getAllByRole('button', { name: 'Billing Disabled' }).length).toBeGreaterThan(0);
	});

	it('exposes subscription controls as a named toolbar action group', () => {
		render(Page, {
			props: {
				data: baseData as never
			}
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Billing controls' });
		const actions = within(toolbar).getByRole('group', { name: 'Billing actions' });

		expect(within(actions).getByRole('button', { name: 'Cancel Subscription' })).toBeTruthy();
		expect(within(actions).getByRole('button', { name: 'Manage Subscription' })).toBeTruthy();
		expect(screen.getAllByRole('button', { name: 'Manage Subscription' }).length).toBeGreaterThan(1);
	});

	it('keeps subscription controls hidden when subscription management is not allowed', () => {
		render(Page, {
			props: {
				data: { ...baseData, canManageSubscription: false } as never
			}
		});

		expect(screen.queryByRole('toolbar', { name: 'Billing controls' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Manage Subscription' })).toBeNull();
	});

	it('keeps subscription actions disabled while requests are in flight', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>(() => {}))
		);
		vi.stubGlobal(
			'confirm',
			vi.fn(() => true)
		);

		render(Page, {
			props: {
				data: baseData as never
			}
		});

		const actions = within(screen.getByRole('toolbar', { name: 'Billing controls' })).getByRole('group', {
			name: 'Billing actions'
		});

		await fireEvent.click(within(actions).getByRole('button', { name: 'Manage Subscription' }));
		expect((within(actions).getByRole('button', { name: 'Opening...' }) as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.click(within(actions).getByRole('button', { name: 'Cancel Subscription' }));
		expect((within(actions).getByRole('button', { name: 'Canceling...' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows payment-failure grace messaging separately from personnel limits', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					effectiveTier: {
						...baseData.effectiveTier,
						isReadOnly: true,
						readOnlyReason: 'payment_failure'
					}
				} as never
			}
		});

		expect(screen.getByText('Payment failed. Your organization is in grace mode.')).toBeTruthy();
		expect(screen.getByText(/A renewal payment failed/)).toBeTruthy();
		expect(screen.queryByText(/your plan allows/)).toBeNull();
	});

	it('shows period-end cancellation timing without ending current paid access copy', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					cancellationSummary: {
						state: 'canceling_at_period_end',
						label: 'Cancels at period end',
						description:
							'Paid access remains active until the paid-through date unless Stripe reports an earlier terminal state.',
						currentPeriodEnd: '2026-06-01T00:00:00.000Z',
						canceledAt: null
					}
				} as never
			}
		});

		expect(screen.getByText('Your subscription is scheduled to cancel.')).toBeTruthy();
		expect(screen.getByText(/Paid access remains active through June 1, 2026/)).toBeTruthy();
		expect(screen.getByText('Cancellation Timing')).toBeTruthy();
		expect(screen.getByText('Cancels at period end')).toBeTruthy();
	});

	it('shows terminal cancellation timing after paid access ends', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					cancellationSummary: {
						state: 'canceled',
						label: 'Canceled',
						description: 'Subscription has ended.',
						currentPeriodEnd: '2026-06-01T00:00:00.000Z',
						canceledAt: '2026-05-23T00:01:00.000Z'
					}
				} as never
			}
		});

		expect(screen.getByText('Your subscription has been canceled.')).toBeTruthy();
		expect(screen.getByText(/Access ended on May 23, 2026/)).toBeTruthy();
		expect(screen.getByText('Canceled')).toBeTruthy();
	});

	it('does not show owner cancellation warnings when an active gift is the access source', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					effectiveTier: {
						...baseData.effectiveTier,
						source: 'gift',
						giftTier: 'team',
						giftExpiresAt: '2026-07-01T00:00:00.000Z'
					},
					cancellationSummary: {
						state: 'canceled',
						label: 'Canceled',
						description: 'Subscription has ended.',
						currentPeriodEnd: '2026-06-01T00:00:00.000Z',
						canceledAt: '2026-05-23T00:01:00.000Z'
					}
				} as never
			}
		});

		expect(screen.queryByText('Your subscription has been canceled.')).toBeNull();
		expect(screen.queryByText('Cancellation Timing')).toBeNull();
		expect(screen.getAllByText('Admin Gift').length).toBeGreaterThan(0);
	});
});
