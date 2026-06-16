import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	BillingEventPosition,
	BillingSnapshotTransitionStore,
	BillingSnapshotUpsert
} from './billingSnapshotTransitions';
import { applyBillingSnapshotTransition } from './billingSnapshotTransitions';

const { invalidateTierCacheMock } = vi.hoisted(() => ({
	invalidateTierCacheMock: vi.fn()
}));

vi.mock('$lib/server/subscription', () => ({
	invalidateTierCache: invalidateTierCacheMock
}));

function createStore(
	input: {
		snapshot?: Awaited<ReturnType<BillingSnapshotTransitionStore['readSnapshot']>>;
		writeResult?: boolean;
		writeError?: Error;
	} = {}
): BillingSnapshotTransitionStore & {
	combinedWrites: Array<{
		snapshot: BillingSnapshotUpsert;
		mirror: Record<string, unknown>;
		eventPosition?: BillingEventPosition;
	}>;
	snapshotWrites: BillingSnapshotUpsert[];
	snapshotWriteEventPositions: Array<BillingEventPosition | undefined>;
	mirrorWrites: Array<{ orgId: string; values: Record<string, unknown> }>;
} {
	const combinedWrites: Array<{
		snapshot: BillingSnapshotUpsert;
		mirror: Record<string, unknown>;
		eventPosition?: BillingEventPosition;
	}> = [];
	const snapshotWrites: BillingSnapshotUpsert[] = [];
	const snapshotWriteEventPositions: Array<BillingEventPosition | undefined> = [];
	const mirrorWrites: Array<{ orgId: string; values: Record<string, unknown> }> = [];

	return {
		combinedWrites,
		snapshotWrites,
		snapshotWriteEventPositions,
		mirrorWrites,
		async readSnapshot() {
			return input.snapshot ?? null;
		},
		async writeSnapshotAndMirrorIfCurrent({ snapshot, mirror, eventPosition }) {
			combinedWrites.push({ snapshot, mirror, eventPosition });
			if (input.writeError) throw input.writeError;
			if (input.writeResult === false) return false;
			snapshotWrites.push(snapshot);
			snapshotWriteEventPositions.push(eventPosition);
			mirrorWrites.push({ orgId: snapshot.organization_id, values: mirror });
			return true;
		}
	};
}

describe('applyBillingSnapshotTransition', () => {
	beforeEach(() => {
		invalidateTierCacheMock.mockClear();
	});

	it('records checkout completion as a pending activation billing snapshot and legacy mirror', async () => {
		const store = createStore();

		const result = await applyBillingSnapshotTransition(store, {
			kind: 'checkout_completed',
			orgId: 'org-1',
			commercialPlan: 'unit',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			event: {
				id: 'evt_checkout',
				type: 'checkout.session.completed',
				createdAt: '1970-01-01T00:00:01.000Z'
			},
			processedAt: '2026-05-25T17:00:00.000Z'
		});

		expect(result).toEqual({
			state: 'processed',
			result: 'checkout pending activation recorded for organization org-1',
			orgId: 'org-1',
			commercialPlan: 'unit'
		});
		expect(store.snapshotWrites).toEqual([
			expect.objectContaining({
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'unit',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'incomplete',
				collection_status: 'pending_activation',
				sync_status: 'pending',
				last_stripe_event_id: 'evt_checkout',
				last_stripe_event_type: 'checkout.session.completed',
				last_stripe_event_created_at: '1970-01-01T00:00:01.000Z',
				last_processed_at: '2026-05-25T17:00:00.000Z',
				drift_detected: false
			})
		]);
		expect(store.mirrorWrites).toEqual([
			{
				orgId: 'org-1',
				values: {
					stripe_customer_id: 'cus_123',
					stripe_subscription_id: 'sub_123',
					subscription_status: 'incomplete',
					current_period_end: null
				}
			}
		]);
		expect(store.combinedWrites).toEqual([
			{
				snapshot: expect.objectContaining({
					organization_id: 'org-1',
					last_stripe_event_id: 'evt_checkout'
				}),
				mirror: {
					stripe_customer_id: 'cus_123',
					stripe_subscription_id: 'sub_123',
					subscription_status: 'incomplete',
					current_period_end: null
				},
				eventPosition: {
					eventId: 'evt_checkout',
					eventType: 'checkout.session.completed',
					eventCreatedAt: '1970-01-01T00:00:01.000Z'
				}
			}
		]);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('maps subscription updates through the price catalog to paid access and the legacy mirror', async () => {
		const store = createStore();

		const result = await applyBillingSnapshotTransition(store, {
			kind: 'subscription_updated',
			orgId: 'org-1',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			stripeProductId: 'prod_team',
			stripePriceId: 'price_team',
			status: 'active',
			currentPeriodStart: '2026-05-01T00:00:00.000Z',
			currentPeriodEnd: '2026-06-01T00:00:00.000Z',
			cancelAtPeriodEnd: false,
			canceledAt: null,
			cancellationReason: null,
			cancellationFeedback: null,
			trialEnd: null,
			metadataTier: 'team',
			priceCatalog: [
				{
					priceId: 'price_team',
					commercialPlan: 'team',
					stripeProductId: 'prod_team',
					activeForCheckout: true
				}
			],
			event: {
				id: 'evt_sub_updated',
				type: 'customer.subscription.updated',
				createdAt: '2026-05-25T17:00:00.000Z'
			},
			processedAt: '2026-05-25T17:01:00.000Z'
		});

		expect(result).toMatchObject({ state: 'processed', orgId: 'org-1' });
		expect(store.snapshotWrites).toEqual([
			expect.objectContaining({
				commercial_plan: 'team',
				stripe_product_id: 'prod_team',
				stripe_price_id: 'price_team',
				subscription_status: 'active',
				collection_status: 'current',
				current_period_start: '2026-05-01T00:00:00.000Z',
				current_period_end: '2026-06-01T00:00:00.000Z',
				sync_status: 'synced'
			})
		]);
		expect(store.mirrorWrites).toEqual([
			{
				orgId: 'org-1',
				values: {
					tier: 'team',
					stripe_customer_id: 'cus_123',
					stripe_subscription_id: 'sub_123',
					subscription_status: 'active',
					current_period_end: '2026-06-01T00:00:00.000Z'
				}
			}
		]);
		expect(store.combinedWrites).toEqual([
			{
				snapshot: expect.objectContaining({
					organization_id: 'org-1',
					commercial_plan: 'team',
					last_stripe_event_id: 'evt_sub_updated'
				}),
				mirror: {
					tier: 'team',
					stripe_customer_id: 'cus_123',
					stripe_subscription_id: 'sub_123',
					subscription_status: 'active',
					current_period_end: '2026-06-01T00:00:00.000Z'
				},
				eventPosition: {
					eventId: 'evt_sub_updated',
					eventType: 'customer.subscription.updated',
					eventCreatedAt: '2026-05-25T17:00:00.000Z'
				}
			}
		]);
		expect(invalidateTierCacheMock).toHaveBeenCalledWith('org-1');
	});

	it('records subscription deletion as free canceled state while preserving support timing in the snapshot', async () => {
		const store = createStore({
			snapshot: {
				last_stripe_event_created_at: '2026-05-25T16:00:00.000Z',
				stripe_customer_id: 'cus_existing',
				stripe_product_id: 'prod_team',
				stripe_price_id: 'price_team',
				current_period_start: '2026-05-01T00:00:00.000Z',
				current_period_end: '2026-06-01T00:00:00.000Z',
				cancellation_reason: 'cancellation_requested',
				cancellation_feedback: 'too_expensive',
				trial_end: null
			}
		});

		const result = await applyBillingSnapshotTransition(store, {
			kind: 'subscription_deleted',
			orgId: 'org-1',
			stripeCustomerId: 'cus_123',
			currentPeriodStart: null,
			currentPeriodEnd: null,
			canceledAt: '2026-05-25T17:00:00.000Z',
			cancellationReason: null,
			cancellationFeedback: null,
			event: {
				id: 'evt_sub_deleted',
				type: 'customer.subscription.deleted',
				createdAt: '2026-05-25T17:00:00.000Z'
			},
			processedAt: '2026-05-25T17:01:00.000Z'
		});

		expect(result).toMatchObject({ state: 'processed', orgId: 'org-1' });
		expect(store.snapshotWrites).toEqual([
			expect.objectContaining({
				commercial_plan: 'free',
				stripe_customer_id: 'cus_existing',
				stripe_subscription_id: null,
				stripe_product_id: 'prod_team',
				stripe_price_id: 'price_team',
				subscription_status: 'canceled',
				collection_status: 'canceled',
				current_period_start: '2026-05-01T00:00:00.000Z',
				current_period_end: '2026-06-01T00:00:00.000Z',
				canceled_at: '2026-05-25T17:00:00.000Z',
				cancellation_reason: 'cancellation_requested',
				cancellation_feedback: 'too_expensive'
			})
		]);
		expect(store.mirrorWrites).toEqual([
			{
				orgId: 'org-1',
				values: {
					tier: 'free',
					stripe_subscription_id: null,
					subscription_status: 'canceled',
					current_period_end: null
				}
			}
		]);
	});

	it('keeps the current plan and marks collection state when payment fails', async () => {
		const store = createStore({
			snapshot: {
				last_stripe_event_created_at: '2026-05-25T16:00:00.000Z',
				commercial_plan: 'unit',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				stripe_product_id: 'prod_unit',
				stripe_price_id: 'price_unit',
				current_period_start: '2026-05-01T00:00:00.000Z',
				current_period_end: '2026-06-01T00:00:00.000Z',
				cancel_at_period_end: false,
				canceled_at: null,
				cancellation_reason: null,
				cancellation_feedback: null,
				trial_end: null
			}
		});

		await applyBillingSnapshotTransition(store, {
			kind: 'payment_failed',
			orgId: 'org-1',
			stripeSubscriptionId: 'sub_123',
			fallbackCommercialPlan: 'team',
			fallbackStripeCustomerId: 'cus_fallback',
			event: {
				id: 'evt_payment_failed',
				type: 'invoice.payment_failed',
				createdAt: '2026-05-25T17:00:00.000Z'
			},
			processedAt: '2026-05-25T17:01:00.000Z'
		});

		expect(store.snapshotWrites).toEqual([
			expect.objectContaining({
				commercial_plan: 'unit',
				subscription_status: 'past_due',
				collection_status: 'payment_failed_grace',
				stripe_subscription_id: 'sub_123'
			})
		]);
		expect(store.mirrorWrites).toEqual([
			{
				orgId: 'org-1',
				values: { subscription_status: 'past_due' }
			}
		]);
	});

	it('restores active collection state when payment succeeds', async () => {
		const store = createStore({
			snapshot: {
				last_stripe_event_created_at: '2026-05-25T16:00:00.000Z',
				commercial_plan: 'team',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				current_period_end: '2026-06-01T00:00:00.000Z',
				cancel_at_period_end: false,
				trial_end: null
			}
		});

		await applyBillingSnapshotTransition(store, {
			kind: 'payment_succeeded',
			orgId: 'org-1',
			stripeSubscriptionId: 'sub_123',
			fallbackCommercialPlan: 'free',
			fallbackStripeCustomerId: null,
			event: {
				id: 'evt_payment_succeeded',
				type: 'invoice.payment_succeeded',
				createdAt: '2026-05-25T17:00:00.000Z'
			},
			processedAt: '2026-05-25T17:01:00.000Z'
		});

		expect(store.snapshotWrites).toEqual([
			expect.objectContaining({
				commercial_plan: 'team',
				subscription_status: 'active',
				collection_status: 'current',
				canceled_at: null,
				cancellation_reason: null,
				cancellation_feedback: null
			})
		]);
		expect(store.mirrorWrites).toEqual([
			{
				orgId: 'org-1',
				values: {
					tier: 'team',
					stripe_subscription_id: 'sub_123',
					subscription_status: 'active',
					current_period_end: '2026-06-01T00:00:00.000Z'
				}
			}
		]);
	});

	it('returns superseded and skips the mirror when a newer provider event already owns the snapshot', async () => {
		const store = createStore({
			snapshot: {
				last_stripe_event_id: 'evt_newer',
				last_stripe_event_created_at: '2026-05-25T18:00:00.000Z'
			}
		});

		const result = await applyBillingSnapshotTransition(store, {
			kind: 'checkout_completed',
			orgId: 'org-1',
			commercialPlan: 'team',
			stripeCustomerId: 'cus_123',
			stripeSubscriptionId: 'sub_123',
			event: {
				id: 'evt_old',
				type: 'checkout.session.completed',
				createdAt: '2026-05-25T17:00:00.000Z'
			}
		});

		expect(result).toEqual({
			state: 'superseded',
			result: 'checkout completion for organization org-1 is older than the current billing snapshot',
			orgId: 'org-1'
		});
		expect(store.snapshotWrites).toEqual([]);
		expect(store.combinedWrites).toEqual([]);
		expect(store.mirrorWrites).toEqual([]);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
	});

	it('returns superseded and skips the mirror when the combined write loses a race', async () => {
		const store = createStore({ writeResult: false });

		const result = await applyBillingSnapshotTransition(store, {
			kind: 'payment_failed',
			orgId: 'org-1',
			stripeSubscriptionId: 'sub_123',
			fallbackCommercialPlan: 'team',
			fallbackStripeCustomerId: 'cus_123',
			event: {
				id: 'evt_payment_failed',
				type: 'invoice.payment_failed',
				createdAt: '2026-05-25T17:00:00.000Z'
			}
		});

		expect(result).toEqual({
			state: 'superseded',
			result: 'payment failure for organization org-1 lost a concurrent billing snapshot update',
			orgId: 'org-1'
		});
		expect(store.combinedWrites).toHaveLength(1);
		expect(store.snapshotWrites).toEqual([]);
		expect(store.mirrorWrites).toEqual([]);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
	});

	it('does not apply a stale mirror payload when the combined write is rejected', async () => {
		const store = createStore({ writeResult: false });

		const result = await applyBillingSnapshotTransition(store, {
			kind: 'subscription_updated',
			orgId: 'org-1',
			stripeCustomerId: 'cus_stale',
			stripeSubscriptionId: 'sub_stale',
			stripeProductId: 'prod_team',
			stripePriceId: 'price_team',
			status: 'active',
			currentPeriodStart: '2026-05-01T00:00:00.000Z',
			currentPeriodEnd: '2026-06-01T00:00:00.000Z',
			cancelAtPeriodEnd: false,
			canceledAt: null,
			cancellationReason: null,
			cancellationFeedback: null,
			trialEnd: null,
			priceCatalog: [
				{
					priceId: 'price_team',
					commercialPlan: 'team',
					stripeProductId: 'prod_team',
					activeForCheckout: true
				}
			],
			event: {
				id: 'evt_stale_replay',
				type: 'customer.subscription.updated',
				createdAt: '2026-05-25T17:00:00.000Z'
			}
		});

		expect(result).toEqual({
			state: 'superseded',
			result: 'subscription update for organization org-1 lost a concurrent billing snapshot update',
			orgId: 'org-1'
		});
		expect(store.combinedWrites).toEqual([
			expect.objectContaining({
				mirror: {
					tier: 'team',
					stripe_customer_id: 'cus_stale',
					stripe_subscription_id: 'sub_stale',
					subscription_status: 'active',
					current_period_end: '2026-06-01T00:00:00.000Z'
				}
			})
		]);
		expect(store.snapshotWrites).toEqual([]);
		expect(store.mirrorWrites).toEqual([]);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
	});

	it('records immediate cancellation as a pending-webhook free canceled snapshot', async () => {
		const store = createStore({
			snapshot: {
				stripe_subscription_id: 'sub_123',
				last_stripe_event_id: 'evt_123',
				last_stripe_event_type: 'customer.subscription.updated',
				last_stripe_event_created_at: '2026-05-24T12:00:00.000Z'
			}
		});

		await applyBillingSnapshotTransition(store, {
			kind: 'immediate_cancellation_requested',
			orgId: 'org-1',
			stripeCustomerId: 'cus_123',
			cancellationFeedback: 'unused',
			processedAt: '2026-05-25T17:00:00.000Z'
		});

		expect(store.snapshotWrites).toEqual([
			expect.objectContaining({
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'free',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				subscription_status: 'canceled',
				collection_status: 'canceled',
				canceled_at: '2026-05-25T17:00:00.000Z',
				cancellation_reason: 'cancellation_requested',
				cancellation_feedback: 'unused',
				sync_status: 'pending',
				last_stripe_event_id: 'evt_123',
				last_stripe_event_type: 'customer.subscription.updated',
				last_stripe_event_created_at: '2026-05-24T12:00:00.000Z',
				reconciliation_result: 'local_immediate_cancellation_pending_webhook'
			})
		]);
		expect(store.snapshotWriteEventPositions).toEqual([
			{
				eventId: 'evt_123',
				eventType: 'customer.subscription.updated',
				eventCreatedAt: '2026-05-24T12:00:00.000Z'
			}
		]);
		expect(store.combinedWrites).toEqual([
			{
				snapshot: expect.objectContaining({
					organization_id: 'org-1',
					commercial_plan: 'free',
					subscription_status: 'canceled'
				}),
				mirror: {
					tier: 'free',
					subscription_status: null,
					stripe_subscription_id: 'sub_123',
					current_period_end: null
				},
				eventPosition: {
					eventId: 'evt_123',
					eventType: 'customer.subscription.updated',
					eventCreatedAt: '2026-05-24T12:00:00.000Z'
				}
			}
		]);
		expect(store.mirrorWrites).toEqual([
			{
				orgId: 'org-1',
				values: {
					tier: 'free',
					subscription_status: null,
					stripe_subscription_id: 'sub_123',
					current_period_end: null
				}
			}
		]);
	});

	it('throws when the combined snapshot and mirror write provider fails so callers can retry safely', async () => {
		const store = createStore({ writeError: new Error('mirror unavailable') });

		await expect(
			applyBillingSnapshotTransition(store, {
				kind: 'immediate_cancellation_requested',
				orgId: 'org-1',
				stripeCustomerId: 'cus_123',
				cancellationFeedback: null,
				processedAt: '2026-05-25T17:00:00.000Z'
			})
		).rejects.toThrow('mirror unavailable');

		expect(store.combinedWrites).toHaveLength(1);
		expect(store.snapshotWrites).toEqual([]);
		expect(store.mirrorWrites).toEqual([]);
		expect(invalidateTierCacheMock).not.toHaveBeenCalled();
	});
});
