import { describe, expect, it, vi } from 'vitest';
import {
	createPlatformBillingHealth,
	mapBillingHealthSummary,
	type PlatformBillingHealthEventRecord,
	type PlatformBillingHealthLinkedBillingContext,
	type PlatformBillingHealthSnapshotRecord,
	type PlatformBillingHealthStore
} from './platformBillingHealth';

const NOW = new Date('2026-06-24T12:00:00.000Z');

function event(overrides: Partial<PlatformBillingHealthEventRecord> = {}): PlatformBillingHealthEventRecord {
	return {
		id: 'evt_retry',
		type: 'checkout.session.completed',
		objectId: 'cs_123',
		eventCreatedAt: '2026-06-24T10:00:00.000Z',
		processingState: 'retryable_failed',
		attemptCount: 2,
		processingResult: 'retryable processing failure',
		createdAt: '2026-06-24T10:00:01.000Z',
		updatedAt: '2026-06-24T10:00:02.000Z',
		...overrides
	};
}

function snapshot(overrides: Partial<PlatformBillingHealthSnapshotRecord> = {}): PlatformBillingHealthSnapshotRecord {
	return {
		organizationId: 'org-1',
		organizationName: 'Alpha Company',
		source: 'stripe',
		commercialPlan: 'team',
		stripeCustomerId: 'cus_safe_identifier',
		stripeSubscriptionId: 'sub_safe_identifier',
		stripeProductId: 'prod_unused',
		stripePriceId: 'price_unused',
		subscriptionStatus: 'active',
		collectionStatus: 'current',
		currentPeriodStart: '2026-06-01T00:00:00.000Z',
		currentPeriodEnd: '2026-07-01T00:00:00.000Z',
		cancelAtPeriodEnd: false,
		canceledAt: null,
		cancellationReason: null,
		cancellationFeedback: null,
		trialEnd: null,
		syncStatus: 'synced',
		lastStripeEventId: 'evt_snapshot',
		lastStripeEventType: 'customer.subscription.updated',
		lastStripeEventCreatedAt: '2026-06-23T00:00:00.000Z',
		lastProcessedAt: '2026-06-23T00:01:00.000Z',
		lastReconciledAt: '2026-06-24T00:00:00.000Z',
		reconciliationResult: 'matched',
		driftDetected: false,
		giftTier: null,
		giftExpiresAt: null,
		...overrides
	};
}

function linkedBillingContext(
	overrides: Partial<PlatformBillingHealthLinkedBillingContext> = {}
): PlatformBillingHealthLinkedBillingContext {
	return {
		organizationId: 'org-linked',
		organizationName: 'Linked Company',
		stripeCustomerId: 'cus_linked_safe_identifier',
		stripeSubscriptionId: 'sub_linked_safe_identifier',
		billingState: {
			source: 'stripe',
			commercialPlan: 'team',
			subscriptionStatus: 'past_due',
			collectionStatus: 'payment_failed_grace',
			syncStatus: 'synced',
			driftDetected: false
		},
		...overrides
	};
}

describe('PlatformBillingHealth', () => {
	it('maps raw billing facts to runtime health states without exposing raw payloads or secrets', () => {
		const summary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'billing',
			events: [
				event(),
				event({
					id: 'evt_permanent',
					processingState: 'permanently_failed',
					eventCreatedAt: '2026-06-22T00:00:00.000Z',
					processingResult: 'permanent processing failure'
				}),
				event({
					id: 'evt_payment_failed',
					type: 'invoice.payment_failed',
					processingState: 'processed',
					processingResult: 'payment failure snapshot recorded'
				})
			],
			snapshots: [
				snapshot({
					organizationId: 'org-drift',
					organizationName: 'Bravo Company',
					syncStatus: 'needs_reconciliation',
					driftDetected: true,
					reconciliationResult: 'repaired_drift:subscription_status'
				}),
				snapshot({
					organizationId: 'org-payment',
					organizationName: 'Charlie Company',
					subscriptionStatus: 'past_due',
					collectionStatus: 'payment_failed_grace'
				}),
				snapshot({
					organizationId: 'org-stale',
					organizationName: 'Delta Company',
					lastReconciledAt: '2026-06-18T00:00:00.000Z'
				})
			]
		});

		expect(summary.states).toEqual([
			'permanent_failure',
			'needs_retry',
			'drift_detected',
			'payment_recovery_attention',
			'reconciliation_stale'
		]);
		expect(summary.counts).toMatchObject({
			retryableFailures: 1,
			permanentFailures: 1,
			staleFailedEvents: 1,
			recentPaymentFailures: 1,
			driftedOrganizations: 1,
			staleReconciliation: 1
		});
		expect(JSON.stringify(summary)).not.toContain('raw_webhook_payload');
		expect(JSON.stringify(summary)).not.toContain('sk_test_');
		expect(JSON.stringify(summary)).not.toContain('whsec_');
	});

	it('keeps critical states visible ahead of lower-priority truncated issues', () => {
		const retryableEvents = Array.from({ length: 12 }, (_, index) =>
			event({
				id: `evt_retry_${index}`,
				processingState: 'retryable_failed'
			})
		);
		const summary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'billing',
			events: [
				...retryableEvents,
				event({
					id: 'evt_hidden_permanent',
					processingState: 'permanently_failed',
					processingResult: 'permanent processing failure'
				})
			],
			snapshots: []
		});

		expect(summary.issues).toHaveLength(12);
		expect(summary.issues[0]).toMatchObject({
			id: 'event:evt_hidden_permanent',
			primaryState: 'permanent_failure'
		});
		expect(summary.issues.slice(1).every((issue) => issue.primaryState === 'needs_retry')).toBe(true);
		expect(summary.issues.some((issue) => issue.id === 'event:evt_retry_11')).toBe(false);
		expect(summary.overallState).toBe('permanent_failure');
		expect(summary.states).toContain('permanent_failure');
		expect(summary.counts).toMatchObject({
			retryableFailures: 12,
			permanentFailures: 1,
			supportAttentionItems: 13
		});
	});

	it('chooses overall health by explicit priority instead of event encounter order', () => {
		const summary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'billing',
			events: [
				event({
					id: 'evt_first_retryable',
					processingState: 'retryable_failed'
				}),
				event({
					id: 'evt_second_permanent',
					processingState: 'permanently_failed'
				})
			],
			snapshots: []
		});

		expect(summary.issues.map((issue) => issue.primaryState)).toEqual(['permanent_failure', 'needs_retry']);
		expect(summary.overallState).toBe('permanent_failure');
		expect(summary.states[0]).toBe('permanent_failure');
	});

	it('uses the highest-priority state and headline for mixed snapshot health issues', () => {
		const summary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'billing',
			events: [],
			snapshots: [
				snapshot({
					organizationId: 'org-mixed',
					organizationName: 'Mixed Company',
					subscriptionStatus: 'past_due',
					collectionStatus: 'payment_failed_grace',
					syncStatus: 'needs_reconciliation',
					driftDetected: true
				})
			]
		});

		expect(summary.issues[0]).toMatchObject({
			primaryState: 'drift_detected',
			states: ['drift_detected', 'payment_recovery_attention'],
			title: 'Billing drift detected'
		});
		expect(summary.issues[0].supportBundle.nextSteps).toEqual(
			expect.arrayContaining(['Run admin billing reconciliation', 'Check customer payment recovery state'])
		);
	});

	it('uses payment recovery detail for payment-only snapshot issues', () => {
		const summary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'billing',
			events: [],
			snapshots: [
				snapshot({
					organizationId: 'org-payment-only',
					organizationName: 'Payment Company',
					subscriptionStatus: 'past_due',
					collectionStatus: 'payment_failed_grace',
					syncStatus: 'synced'
				})
			]
		});

		expect(summary.issues[0]).toMatchObject({
			primaryState: 'payment_recovery_attention',
			detail: 'Payment Company payment recovery is past_due with payment_failed_grace collection.'
		});
		expect(summary.issues[0].detail).not.toContain('billing is synced');
	});

	it('attaches linked billing context to event issues while honoring billing visibility', () => {
		const context = linkedBillingContext();
		const linkedEvent = {
			...event({
				id: 'evt_linked_payment_failed',
				type: 'invoice.payment_failed',
				processingState: 'retryable_failed',
				linkedBillingContext: context
			}),
			rawWebhookPayload: 'sk_test_should_not_leak whsec_should_not_leak',
			paymentMethod: 'pm_should_not_leak',
			sessionCookie: 'session_should_not_leak'
		} as PlatformBillingHealthEventRecord;

		const billingSummary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'billing',
			events: [linkedEvent],
			snapshots: []
		});

		expect(billingSummary.counts.recentPaymentFailures).toBe(1);
		expect(billingSummary.issues[0]).toMatchObject({
			id: 'event:evt_linked_payment_failed',
			organization: { id: 'org-linked', name: 'Linked Company' },
			states: ['needs_retry', 'payment_recovery_attention'],
			supportBundle: {
				organizationId: 'org-linked',
				organizationName: 'Linked Company',
				stripeCustomerId: 'cus_linked_safe_identifier',
				stripeSubscriptionId: 'sub_linked_safe_identifier',
				billingState: context.billingState
			}
		});
		expect(JSON.stringify(billingSummary)).not.toContain('sk_test_should_not_leak');
		expect(JSON.stringify(billingSummary)).not.toContain('whsec_should_not_leak');
		expect(JSON.stringify(billingSummary)).not.toContain('pm_should_not_leak');
		expect(JSON.stringify(billingSummary)).not.toContain('session_should_not_leak');

		const supportSummary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'support',
			events: [linkedEvent],
			snapshots: []
		});

		expect(supportSummary.issues[0]).toMatchObject({
			organization: { id: 'org-linked', name: 'Linked Company' },
			supportBundle: {
				organizationId: 'org-linked',
				organizationName: 'Linked Company',
				stripeCustomerId: null,
				stripeSubscriptionId: null,
				billingState: context.billingState
			}
		});
		expect(JSON.stringify(supportSummary)).not.toContain('cus_linked_safe_identifier');
		expect(JSON.stringify(supportSummary)).not.toContain('sub_linked_safe_identifier');
	});

	it('does not keep payment recovery attention for processed invoice failures once billing is recovered', () => {
		const summary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'billing',
			events: [
				event({
					id: 'evt_recovered_payment_failed',
					type: 'invoice.payment_failed',
					processingState: 'processed',
					processingResult: 'payment failure snapshot recovered',
					linkedBillingContext: linkedBillingContext({
						organizationId: 'org-recovered',
						organizationName: 'Recovered Company',
						billingState: {
							source: 'stripe',
							commercialPlan: 'team',
							subscriptionStatus: 'active',
							collectionStatus: 'current',
							syncStatus: 'synced',
							driftDetected: false
						}
					})
				})
			],
			snapshots: [
				snapshot({
					organizationId: 'org-recovered',
					organizationName: 'Recovered Company',
					subscriptionStatus: 'active',
					collectionStatus: 'current',
					syncStatus: 'synced'
				})
			]
		});

		expect(summary).toMatchObject({
			overallState: 'healthy',
			states: ['healthy'],
			counts: {
				recentPaymentFailures: 0,
				supportAttentionItems: 0
			}
		});
		expect(summary.issues).toEqual([]);
		expect(JSON.stringify(summary)).not.toContain('payment_recovery_attention');
	});

	it('keeps retry attention without payment recovery attention when a failed invoice event has recovered billing state', () => {
		const summary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'billing',
			events: [
				event({
					id: 'evt_retry_recovered_payment_failed',
					type: 'invoice.payment_failed',
					processingState: 'retryable_failed',
					processingResult: 'retryable processing failure',
					linkedBillingContext: linkedBillingContext({
						organizationId: 'org-recovered',
						organizationName: 'Recovered Company',
						billingState: {
							source: 'stripe',
							commercialPlan: 'team',
							subscriptionStatus: 'active',
							collectionStatus: 'current',
							syncStatus: 'synced',
							driftDetected: false
						}
					})
				})
			],
			snapshots: []
		});

		expect(summary.counts).toMatchObject({
			retryableFailures: 1,
			recentPaymentFailures: 0,
			supportAttentionItems: 1
		});
		expect(summary.issues[0]).toMatchObject({
			primaryState: 'needs_retry',
			states: ['needs_retry'],
			organization: { id: 'org-recovered', name: 'Recovered Company' }
		});
		expect(summary.issues[0].supportBundle.nextSteps).toEqual(['Retry guarded webhook event']);
		expect(JSON.stringify(summary)).not.toContain('payment_recovery_attention');
	});

	it('keeps support role bundles free of provider identifiers while preserving next-step labels', () => {
		const summary = mapBillingHealthSummary({
			now: NOW,
			adminRole: 'support',
			events: [],
			snapshots: [snapshot({ driftDetected: true })]
		});

		expect(summary.issues[0].supportBundle).toMatchObject({
			organizationId: 'org-1',
			organizationName: 'Alpha Company',
			stripeCustomerId: null,
			stripeSubscriptionId: null,
			nextSteps: ['Run admin billing reconciliation']
		});
		expect(JSON.stringify(summary)).not.toContain('cus_safe_identifier');
		expect(JSON.stringify(summary)).not.toContain('sub_safe_identifier');
	});

	it('returns diagnostics_unavailable when the health store fails', async () => {
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const store: PlatformBillingHealthStore = {
			listRecentHealthEvents: vi.fn(async () => {
				throw new Error('database offline');
			}),
			listBillingSnapshotsForHealth: vi.fn(async () => [])
		};

		const summary = await createPlatformBillingHealth({
			store,
			adminRole: 'billing',
			now: () => NOW
		}).summarize();

		expect(summary).toMatchObject({
			overallState: 'diagnostics_unavailable',
			states: ['diagnostics_unavailable'],
			diagnosticsError: true,
			counts: {
				retryableFailures: 0,
				permanentFailures: 0,
				staleFailedEvents: 0,
				recentPaymentFailures: 0,
				driftedOrganizations: 0,
				staleReconciliation: 0,
				supportAttentionItems: 0
			}
		});
		expect(consoleError).toHaveBeenCalledWith('Admin billing health query failed:', expect.any(Error));
		consoleError.mockRestore();
	});
});
