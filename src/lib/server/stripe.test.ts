import { describe, expect, it, vi } from 'vitest';

const { subscriptionsListMock, subscriptionsRetrieveMock } = vi.hoisted(() => ({
	subscriptionsListMock: vi.fn(),
	subscriptionsRetrieveMock: vi.fn()
}));

vi.mock('$env/static/private', () => ({
	STRIPE_SECRET_KEY: 'sk_test_123',
	STRIPE_WEBHOOK_SECRET: 'whsec_123',
	STRIPE_TEAM_PRICE_ID: 'price_team',
	STRIPE_UNIT_PRICE_ID: 'price_unit'
}));

vi.mock('stripe', () => {
	class StripeInvalidRequestError extends Error {
		statusCode?: number;
	}

	class StripeMock {
		static errors = { StripeInvalidRequestError };
		subscriptions = {
			list: subscriptionsListMock,
			retrieve: subscriptionsRetrieveMock,
			update: vi.fn(),
			cancel: vi.fn()
		};
		customers = { create: vi.fn() };
		checkout = { sessions: { create: vi.fn() } };
		billingPortal = { sessions: { create: vi.fn() } };
		webhooks = { constructEvent: vi.fn() };
	}

	return { default: StripeMock };
});

import { createStripeBillingReconciliationProvider } from './stripe';

function stripeSubscription(id: string) {
	return {
		id,
		customer: 'cus_123',
		status: 'active',
		items: {
			data: [
				{
					price: {
						id: 'price_team',
						product: 'prod_team'
					}
				}
			]
		},
		current_period_start: 1_767_225_600,
		current_period_end: 1_769_904_000,
		cancel_at_period_end: false,
		canceled_at: null,
		trial_end: null,
		metadata: { orgId: 'org-1', tier: 'team' }
	};
}

describe('createStripeBillingReconciliationProvider', () => {
	it('paginates customer subscriptions before mapping provider subscriptions', async () => {
		subscriptionsListMock
			.mockResolvedValueOnce({ data: [stripeSubscription('sub_1')], has_more: true })
			.mockResolvedValueOnce({ data: [stripeSubscription('sub_2')], has_more: false });

		const provider = createStripeBillingReconciliationProvider();

		await expect(provider.listSubscriptionsForCustomer('cus_123')).resolves.toEqual([
			expect.objectContaining({ id: 'sub_1', customerId: 'cus_123', priceId: 'price_team' }),
			expect.objectContaining({ id: 'sub_2', customerId: 'cus_123', priceId: 'price_team' })
		]);
		expect(subscriptionsListMock).toHaveBeenNthCalledWith(1, {
			customer: 'cus_123',
			status: 'all',
			limit: 100
		});
		expect(subscriptionsListMock).toHaveBeenNthCalledWith(2, {
			customer: 'cus_123',
			status: 'all',
			limit: 100,
			starting_after: 'sub_1'
		});
	});
});
