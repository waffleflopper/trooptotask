import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { CHECKOUT_ATTEMPTS_TABLE, type CheckoutAttemptRow } from '$lib/server/core/useCases/billingCheckoutAttempts';
import type { BillingSnapshot } from '$lib/types/subscription';

const { readCurrentBillingSnapshotMock } = vi.hoisted(() => ({
	readCurrentBillingSnapshotMock: vi.fn()
}));

vi.mock('$lib/server/core/useCases/billingState', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/billingState')>(
		'$lib/server/core/useCases/billingState'
	);

	return {
		...actual,
		readCurrentBillingSnapshot: readCurrentBillingSnapshotMock
	};
});

import { _buildCheckoutSuccessStatus, _loadCheckoutSuccessPageData } from './+page.server';

function snapshot(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
	return {
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
		cancellationReason: null,
		cancellationFeedback: null,
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
		giftExpiresAt: null,
		...overrides
	};
}

function attempt(overrides: Partial<CheckoutAttemptRow> = {}): CheckoutAttemptRow {
	return {
		id: 'attempt-success-return',
		organization_id: 'org-1',
		stripe_checkout_session_id: 'cs_success',
		stripe_customer_id: 'cus_success',
		commercial_plan: 'team',
		stripe_price_id: 'price_team',
		checkout_url: 'https://checkout.test/success',
		status: 'in_progress',
		expires_at: '2026-05-24T11:00:00.000Z',
		completed_at: null,
		canceled_at: null,
		created_at: '2026-05-24T09:00:00.000Z',
		updated_at: '2026-05-24T09:00:00.000Z',
		...overrides
	};
}

describe('_buildCheckoutSuccessStatus', () => {
	it('represents locally active paid plans as active', () => {
		expect(_buildCheckoutSuccessStatus({ snapshot: snapshot(), checkoutAttempt: null })).toMatchObject({
			state: 'active',
			title: 'Plan Active',
			description: 'Your plan is active. The new limits are available for this organization.'
		});
	});

	it('represents payment-incomplete billing states with recovery copy', () => {
		expect(
			_buildCheckoutSuccessStatus({
				snapshot: snapshot({ subscriptionStatus: 'incomplete', syncStatus: 'pending' }),
				checkoutAttempt: null
			})
		).toMatchObject({
			state: 'payment_incomplete',
			title: 'Payment Needs Attention',
			detail: 'Open Billing to update payment details or try again. Your current data remains available.'
		});
	});

	it('represents incomplete local billing state even when a returned checkout attempt is present', () => {
		expect(
			_buildCheckoutSuccessStatus({
				snapshot: snapshot({ subscriptionStatus: 'incomplete', syncStatus: 'pending' }),
				checkoutAttempt: { status: 'completed' }
			})
		).toMatchObject({
			state: 'payment_incomplete',
			title: 'Payment Needs Attention'
		});
	});

	it('represents returned checkout attempts without local subscription state as pending', () => {
		expect(
			_buildCheckoutSuccessStatus({
				snapshot: snapshot({ commercialPlan: 'free', subscriptionStatus: null, syncStatus: 'not_configured' }),
				checkoutAttempt: { status: 'in_progress' }
			})
		).toMatchObject({
			state: 'pending',
			title: 'Checkout Received',
			description: 'Checkout finished, and TroopToTask is confirming the plan update.'
		});
	});

	it('represents expired checkout attempts without active billing as still updating', () => {
		expect(
			_buildCheckoutSuccessStatus({
				snapshot: snapshot({ commercialPlan: 'free', subscriptionStatus: null, syncStatus: 'not_configured' }),
				checkoutAttempt: { status: 'expired' }
			})
		).toMatchObject({
			state: 'still_syncing',
			title: 'Billing Is Still Updating'
		});
	});

	it('represents missing local checkout context as still updating', () => {
		expect(
			_buildCheckoutSuccessStatus({
				snapshot: snapshot({ commercialPlan: 'free', subscriptionStatus: null, syncStatus: 'not_configured' }),
				checkoutAttempt: null
			})
		).toMatchObject({
			state: 'still_syncing',
			title: 'Billing Is Still Updating',
			description: 'Checkout returned to TroopToTask, but the billing record has not finished updating yet.'
		});
	});
});

describe('billing success page server load', () => {
	beforeEach(() => {
		readCurrentBillingSnapshotMock.mockReset();
	});

	it('returns route data derived from the billing snapshot and checkout attempt id', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [attempt() as unknown as Record<string, unknown>]);
		readCurrentBillingSnapshotMock.mockResolvedValue(
			snapshot({ commercialPlan: 'free', subscriptionStatus: null, syncStatus: 'not_configured' })
		);

		await expect(
			_loadCheckoutSuccessPageData(ctx, {
				checkoutAttemptId: 'attempt-success-return',
				recoverCheckoutSuccess: vi.fn().mockResolvedValue(false)
			})
		).resolves.toEqual({
			orgId: 'org-1',
			checkoutStatus: expect.objectContaining({
				state: 'pending',
				title: 'Checkout Received'
			})
		});
	});

	it('recovers completed provider checkout before reporting success status', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1'
			}
		});
		ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [attempt() as unknown as Record<string, unknown>]);
		readCurrentBillingSnapshotMock
			.mockResolvedValueOnce(
				snapshot({ commercialPlan: 'free', subscriptionStatus: null, syncStatus: 'not_configured' })
			)
			.mockResolvedValueOnce(snapshot());
		const recoverCheckoutSuccess = vi.fn().mockResolvedValue(true);

		await expect(
			_loadCheckoutSuccessPageData(ctx, {
				checkoutAttemptId: 'attempt-success-return',
				recoverCheckoutSuccess
			})
		).resolves.toEqual({
			orgId: 'org-1',
			checkoutStatus: expect.objectContaining({
				state: 'active',
				title: 'Plan Active'
			})
		});
		expect(recoverCheckoutSuccess).toHaveBeenCalledWith(
			ctx,
			expect.objectContaining({
				checkoutAttempt: expect.objectContaining({
					id: 'attempt-success-return',
					stripe_checkout_session_id: 'cs_success'
				})
			})
		);
	});

	it('ignores blank checkout attempt ids while still reading local billing state', async () => {
		const ctx = createTestContext();
		readCurrentBillingSnapshotMock.mockResolvedValue(snapshot());

		await expect(
			_loadCheckoutSuccessPageData(ctx, {
				checkoutAttemptId: '  '
			})
		).resolves.toEqual({
			orgId: ctx.auth.orgId,
			checkoutStatus: expect.objectContaining({
				state: 'active'
			})
		});
	});
});
