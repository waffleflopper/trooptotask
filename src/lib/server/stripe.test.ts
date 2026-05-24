import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	checkoutCreateMock,
	customersCreateMock,
	pricesRetrieveMock,
	subscriptionsListMock,
	subscriptionsRetrieveMock
} = vi.hoisted(() => ({
	checkoutCreateMock: vi.fn(),
	customersCreateMock: vi.fn(),
	pricesRetrieveMock: vi.fn(),
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
		customers = { create: customersCreateMock };
		checkout = { sessions: { create: checkoutCreateMock } };
		billingPortal = { sessions: { create: vi.fn() } };
		prices = { retrieve: pricesRetrieveMock };
		webhooks = { constructEvent: vi.fn() };
	}

	return { default: StripeMock };
});

import {
	createCheckoutSession,
	createStripeBillingReconciliationProvider,
	validateCheckoutPriceForSecretMode
} from './stripe';

beforeEach(() => {
	vi.clearAllMocks();
});

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

describe('createCheckoutSession', () => {
	it('creates checkout with the catalog-resolved price, client reference, and reconciliation metadata', async () => {
		pricesRetrieveMock.mockResolvedValue({
			id: 'price_team',
			livemode: false,
			active: true,
			recurring: { interval: 'month' }
		});
		customersCreateMock.mockResolvedValue({ id: 'cus_created' });
		checkoutCreateMock.mockResolvedValue({
			id: 'cs_test_123',
			url: 'https://checkout.stripe.test/session',
			expires_at: 1_769_904_000
		});

		await expect(
			createCheckoutSession({
				orgId: 'org-1',
				orgName: 'Alpha Company',
				tier: 'team',
				priceId: 'price_team',
				checkoutAttemptId: 'attempt-123',
				customerEmail: 'owner@example.test',
				successUrl: 'http://localhost/success',
				cancelUrl: 'http://localhost/canceled'
			})
		).resolves.toEqual({
			url: 'https://checkout.stripe.test/session',
			customerId: 'cus_created',
			sessionId: 'cs_test_123',
			expiresAt: '2026-02-01T00:00:00.000Z'
		});

		expect(pricesRetrieveMock).toHaveBeenCalledWith('price_team');
		expect(checkoutCreateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				customer: 'cus_created',
				client_reference_id: 'org-1',
				line_items: [{ price: 'price_team', quantity: 1 }],
				metadata: {
					orgId: 'org-1',
					tier: 'team',
					commercialPlan: 'team',
					priceId: 'price_team',
					checkoutAttemptId: 'attempt-123'
				},
				subscription_data: {
					metadata: {
						orgId: 'org-1',
						tier: 'team',
						commercialPlan: 'team',
						priceId: 'price_team',
						checkoutAttemptId: 'attempt-123'
					}
				}
			})
		);
	});

	it('validates checkout price mode before creating a customer or session', async () => {
		pricesRetrieveMock.mockResolvedValue({
			id: 'price_live',
			livemode: true,
			active: true,
			recurring: { interval: 'month' }
		});

		await expect(
			createCheckoutSession({
				orgId: 'org-1',
				orgName: 'Alpha Company',
				tier: 'team',
				priceId: 'price_live',
				customerEmail: 'owner@example.test',
				successUrl: 'http://localhost/success',
				cancelUrl: 'http://localhost/canceled'
			})
		).rejects.toThrow('belongs to live mode but the Stripe secret key is test mode');

		expect(customersCreateMock).not.toHaveBeenCalled();
		expect(checkoutCreateMock).not.toHaveBeenCalled();
	});
});

describe('validateCheckoutPriceForSecretMode', () => {
	it('rejects obvious live/test mode mismatches', () => {
		expect(() =>
			validateCheckoutPriceForSecretMode(
				{ id: 'price_live', livemode: true, active: true, recurring: { interval: 'month' } as never },
				'sk_test_123'
			)
		).toThrow('belongs to live mode but the Stripe secret key is test mode');

		expect(() =>
			validateCheckoutPriceForSecretMode(
				{ id: 'price_test', livemode: false, active: true, recurring: { interval: 'month' } as never },
				'sk_live_123'
			)
		).toThrow('belongs to test mode but the Stripe secret key is live mode');
	});

	it('accepts restricted keys when their mode matches the checkout price', () => {
		expect(() =>
			validateCheckoutPriceForSecretMode(
				{ id: 'price_test', livemode: false, active: true, recurring: { interval: 'month' } as never },
				'rk_test_123'
			)
		).not.toThrow();

		expect(() =>
			validateCheckoutPriceForSecretMode(
				{ id: 'price_live', livemode: true, active: true, recurring: { interval: 'month' } as never },
				'rk_live_123'
			)
		).not.toThrow();
	});

	it('rejects checkout price validation when the secret key mode cannot be determined', () => {
		expect(() =>
			validateCheckoutPriceForSecretMode(
				{ id: 'price_team', livemode: false, active: true, recurring: { interval: 'month' } as never },
				'unknown_123'
			)
		).toThrow('Stripe secret key mode could not be determined');
	});

	it('rejects inactive and non-recurring checkout prices', () => {
		expect(() =>
			validateCheckoutPriceForSecretMode(
				{ id: 'price_inactive', livemode: false, active: false, recurring: { interval: 'month' } as never },
				'sk_test_123'
			)
		).toThrow('Configured checkout price price_inactive is not active');

		expect(() =>
			validateCheckoutPriceForSecretMode(
				{ id: 'price_one_time', livemode: false, active: true, recurring: null },
				'sk_test_123'
			)
		).toThrow('Configured checkout price price_one_time must be a recurring price');
	});
});
