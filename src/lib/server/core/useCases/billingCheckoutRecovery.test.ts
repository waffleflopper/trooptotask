import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	CHECKOUT_ATTEMPTS_TABLE,
	type CheckoutAttemptRow,
	markCheckoutAttemptCompleted
} from './billingCheckoutAttempts';
import {
	type BillingCheckoutRecoveryPorts,
	type BillingCheckoutRecoverySession,
	recoverCompletedCheckout
} from './billingCheckoutRecovery';

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

function session(overrides: Partial<BillingCheckoutRecoverySession> = {}): BillingCheckoutRecoverySession {
	return {
		id: 'cs_success',
		status: 'complete',
		paymentStatus: 'paid',
		customerId: 'cus_success',
		subscriptionId: 'sub_success',
		metadata: {
			orgId: 'org-1',
			checkoutAttemptId: 'attempt-success-return'
		},
		...overrides
	};
}

function recoveryPorts(
	overrides: Partial<BillingCheckoutRecoveryPorts> = {}
): BillingCheckoutRecoveryPorts & { events: string[] } {
	const events: string[] = [];

	return {
		events,
		retrieveCheckoutSession: vi.fn(async (sessionId) => {
			events.push(`retrieve:${sessionId}`);
			return session();
		}),
		reconcileOrganizationBilling: vi.fn(async (orgId) => {
			events.push(`reconcile:${orgId}`);
		}),
		markCheckoutAttemptCompleted: vi.fn(async (store, orgId, attemptId, now) => {
			events.push(`mark:${attemptId}`);
			return markCheckoutAttemptCompleted(store, orgId, attemptId, now);
		}),
		...overrides
	};
}

describe('recoverCompletedCheckout', () => {
	it('returns false without retrieving Stripe when the attempt has no checkout session id', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const ports = recoveryPorts({
			retrieveCheckoutSession: vi.fn(async () => {
				throw new Error('should not retrieve');
			})
		});

		await expect(
			recoverCompletedCheckout({
				ports,
				store: ctx.rawStore,
				orgId: 'org-1',
				checkoutAttempt: attempt({ stripe_checkout_session_id: null })
			})
		).resolves.toBe(false);

		expect(ports.retrieveCheckoutSession).not.toHaveBeenCalled();
	});

	it('returns false without retrieving Stripe when the attempt is not in progress', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const ports = recoveryPorts({
			retrieveCheckoutSession: vi.fn(async () => {
				throw new Error('should not retrieve');
			})
		});

		await expect(
			recoverCompletedCheckout({
				ports,
				store: ctx.rawStore,
				orgId: 'org-1',
				checkoutAttempt: attempt({ status: 'completed' })
			})
		).resolves.toBe(false);

		expect(ports.retrieveCheckoutSession).not.toHaveBeenCalled();
	});

	it('returns false when the provider session is not complete and paid with a subscription', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const ports = recoveryPorts({
			retrieveCheckoutSession: vi.fn(async () => session({ paymentStatus: 'unpaid' }))
		});

		await expect(
			recoverCompletedCheckout({
				ports,
				store: ctx.rawStore,
				orgId: 'org-1',
				checkoutAttempt: attempt()
			})
		).resolves.toBe(false);

		expect(ports.reconcileOrganizationBilling).not.toHaveBeenCalled();
		expect(ports.markCheckoutAttemptCompleted).not.toHaveBeenCalled();
	});

	it('returns false when provider metadata belongs to another organization', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const ports = recoveryPorts({
			retrieveCheckoutSession: vi.fn(async () =>
				session({
					metadata: {
						orgId: 'org-2',
						checkoutAttemptId: 'attempt-success-return'
					}
				})
			)
		});

		await expect(
			recoverCompletedCheckout({
				ports,
				store: ctx.rawStore,
				orgId: 'org-1',
				checkoutAttempt: attempt()
			})
		).resolves.toBe(false);

		expect(ports.reconcileOrganizationBilling).not.toHaveBeenCalled();
		expect(ports.markCheckoutAttemptCompleted).not.toHaveBeenCalled();
	});

	it('returns false when provider metadata belongs to another checkout attempt', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const ports = recoveryPorts({
			retrieveCheckoutSession: vi.fn(async () =>
				session({
					metadata: {
						orgId: 'org-1',
						checkoutAttemptId: 'attempt-other'
					}
				})
			)
		});

		await expect(
			recoverCompletedCheckout({
				ports,
				store: ctx.rawStore,
				orgId: 'org-1',
				checkoutAttempt: attempt()
			})
		).resolves.toBe(false);

		expect(ports.reconcileOrganizationBilling).not.toHaveBeenCalled();
		expect(ports.markCheckoutAttemptCompleted).not.toHaveBeenCalled();
	});

	it('reconciles billing before marking the checkout attempt completed', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const checkoutAttempt = attempt();
		const ports = recoveryPorts();
		const now = new Date('2026-05-24T12:00:00.000Z');
		ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [checkoutAttempt as unknown as Record<string, unknown>]);

		await expect(
			recoverCompletedCheckout({
				ports,
				store: ctx.rawStore,
				orgId: 'org-1',
				checkoutAttempt,
				now
			})
		).resolves.toBe(true);

		expect(ports.events).toEqual(['retrieve:cs_success', 'reconcile:org-1', 'mark:attempt-success-return']);
		const storedAttempt = await ctx.rawStore.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, 'org-1', {
			id: 'attempt-success-return'
		});
		expect(storedAttempt).toMatchObject({
			status: 'completed',
			completed_at: '2026-05-24T12:00:00.000Z'
		});
	});

	it('keeps checkout attempts retryable when recovery reconciliation fails', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		const checkoutAttempt = attempt();
		const ports = recoveryPorts({
			reconcileOrganizationBilling: vi.fn(async () => {
				throw new Error('reconciliation unavailable');
			})
		});
		ctx.rawStore.seed(CHECKOUT_ATTEMPTS_TABLE, [checkoutAttempt as unknown as Record<string, unknown>]);

		await expect(
			recoverCompletedCheckout({
				ports,
				store: ctx.rawStore,
				orgId: 'org-1',
				checkoutAttempt,
				now: new Date('2026-05-24T12:00:00.000Z')
			})
		).rejects.toThrow('reconciliation unavailable');

		const storedAttempt = await ctx.rawStore.findOne<CheckoutAttemptRow>(CHECKOUT_ATTEMPTS_TABLE, 'org-1', {
			id: 'attempt-success-return'
		});
		expect(storedAttempt).toMatchObject({
			status: 'in_progress',
			completed_at: null
		});
	});
});
