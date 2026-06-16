import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { BillingSnapshot, Tier } from '$lib/types/subscription';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => true)
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

import {
	buildEffectivePlanPolicy,
	checkCanAddPersonnelForPlanPolicy,
	checkCanCreateOrganizationForPlanPolicies,
	getAvailablePersonnelSlotsForPlanPolicy,
	readEffectivePlanPolicy,
	toEffectiveTierFromPlanPolicy
} from './planPolicy';

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
		lastStripeEventCreatedAt: '2026-05-01T00:01:00.000Z',
		lastProcessedAt: '2026-05-01T00:02:00.000Z',
		lastReconciledAt: null,
		reconciliationResult: null,
		driftDetected: false,
		giftTier: null,
		giftExpiresAt: null,
		...overrides
	};
}

describe('plan policy', () => {
	it.each([
		{
			name: 'billing-disabled fallback',
			input: snapshot({
				source: 'billing_disabled',
				commercialPlan: 'unit',
				stripeCustomerId: null,
				stripeSubscriptionId: null,
				stripeProductId: null,
				stripePriceId: null,
				subscriptionStatus: null,
				collectionStatus: null,
				syncStatus: 'billing_disabled'
			}),
			expectedPlan: 'unit' as Tier,
			expectedSource: 'billing_disabled_fallback',
			expectedReadOnly: false,
			expectedGraceMode: 'none'
		},
		{
			name: 'Stripe-backed billing snapshot',
			input: snapshot({ commercialPlan: 'team', subscriptionStatus: 'active' }),
			expectedPlan: 'team' as Tier,
			expectedSource: 'billing_snapshot',
			expectedReadOnly: false,
			expectedGraceMode: 'none'
		},
		{
			name: 'admin gift source',
			input: snapshot({
				source: 'gift',
				commercialPlan: 'unit',
				giftTier: 'unit',
				giftExpiresAt: '2999-01-01T00:00:00.000Z'
			}),
			expectedPlan: 'unit' as Tier,
			expectedSource: 'admin_gift',
			expectedReadOnly: false,
			expectedGraceMode: 'none'
		},
		{
			name: 'past-due grace',
			input: snapshot({
				commercialPlan: 'team',
				subscriptionStatus: 'past_due',
				collectionStatus: 'payment_failed_grace'
			}),
			expectedPlan: 'team' as Tier,
			expectedSource: 'billing_snapshot',
			expectedReadOnly: true,
			expectedGraceMode: 'payment_failed',
			expectedReasonCode: 'denied.payment_failed'
		},
		{
			name: 'canceled subscription',
			input: snapshot({
				commercialPlan: 'team',
				subscriptionStatus: 'canceled',
				collectionStatus: 'canceled'
			}),
			expectedPlan: 'team' as Tier,
			expectedSource: 'billing_snapshot',
			expectedReadOnly: true,
			expectedGraceMode: 'none',
			expectedReasonCode: 'denied.billing_not_current'
		}
	])(
		'builds an effective policy for $name',
		({ input, expectedPlan, expectedSource, expectedReadOnly, expectedGraceMode, expectedReasonCode }) => {
			const policy = buildEffectivePlanPolicy(input);

			expect(policy).toMatchObject({
				organizationId: 'org-1',
				commercialPlan: expectedPlan,
				tier: expectedPlan,
				source: expectedSource,
				billingSource: input.source,
				limits: {
					activePersonnel: expect.any(Object),
					activeOrganizationMembers: expect.any(Object),
					pendingInvitations: expect.any(Object),
					ownedOrganizations: expect.any(Object)
				},
				exportQuota: expect.any(Object),
				entitlements: expect.any(Object),
				grace: { mode: expectedGraceMode },
				readOnly: { enabled: expectedReadOnly }
			});
			if (expectedReasonCode) {
				expect(policy.readOnly.reasons).toEqual([
					expect.objectContaining({
						code: expectedReasonCode,
						dimension: 'billing_state',
						message: expect.any(String),
						remediation: expect.any(String)
					})
				]);
			} else {
				expect(policy.readOnly.reasons).toEqual([]);
			}
		}
	);

	it('lets an active admin gift override past-due Stripe grace state', () => {
		const policy = buildEffectivePlanPolicy(
			snapshot({
				source: 'gift',
				commercialPlan: 'unit',
				subscriptionStatus: 'past_due',
				collectionStatus: 'payment_failed_grace',
				giftTier: 'unit',
				giftExpiresAt: '2999-01-01T00:00:00.000Z'
			})
		);

		expect(policy).toMatchObject({
			source: 'admin_gift',
			commercialPlan: 'unit',
			giftExpiresAt: '2999-01-01T00:00:00.000Z',
			grace: { mode: 'none', message: null },
			readOnly: { enabled: false, reasons: [] }
		});
	});

	it('preserves unlimited fallback limits when billing is disabled', () => {
		const policy = buildEffectivePlanPolicy(
			snapshot({
				source: 'billing_disabled',
				commercialPlan: 'unit',
				stripeCustomerId: null,
				stripeSubscriptionId: null,
				stripeProductId: null,
				stripePriceId: null,
				subscriptionStatus: null,
				collectionStatus: null,
				syncStatus: 'billing_disabled'
			})
		);

		expect(policy.limits.activePersonnel.limit).toBeNull();
		expect(policy.limits.ownedOrganizations.limit).toBeNull();
		expect(policy.exportQuota.unlimited).toBe(true);
	});

	it('denies personnel creation at the active personnel cap with upgrade and archive guidance', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));
		const usage = { activePersonnelCount: 20 };

		const result = checkCanAddPersonnelForPlanPolicy(policy, usage);

		expect(result).toEqual({
			allowed: false,
			message: 'Personnel limit reached. Upgrade or archive personnel to add more.'
		});
	});

	it('returns available personnel slots for batch import trimming from the same policy limit', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'team' }));
		const usage = { activePersonnelCount: 78 };

		expect(getAvailablePersonnelSlotsForPlanPolicy(policy, usage)).toBe(2);
	});

	it('keeps existing effective-tier callers on a policy-backed compatibility path', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));
		const tier = toEffectiveTierFromPlanPolicy(policy, { activePersonnelCount: 24 });

		expect(tier).toMatchObject({
			tier: 'free',
			source: 'subscription',
			personnelCount: 24,
			personnelCap: 20,
			isReadOnly: true,
			readOnlyReason: 'personnel_limit'
		});
	});

	it('treats a canceled Stripe snapshot on Free as the base Free plan for owner-facing source labels', () => {
		const policy = buildEffectivePlanPolicy(
			snapshot({
				commercialPlan: 'free',
				subscriptionStatus: 'canceled',
				collectionStatus: 'canceled',
				stripeSubscriptionId: null,
				stripeProductId: null,
				stripePriceId: null
			})
		);
		const tier = toEffectiveTierFromPlanPolicy(policy, { activePersonnelCount: 69 });

		expect(policy).toMatchObject({
			commercialPlan: 'free',
			source: 'legacy_organization',
			billingSource: 'stripe'
		});
		expect(tier).toMatchObject({
			tier: 'free',
			source: 'default',
			personnelCap: 20,
			isReadOnly: true,
			readOnlyReason: 'billing_state'
		});
	});

	it('does not mark the effective-tier compatibility path read-only at exactly the personnel cap', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));
		const tier = toEffectiveTierFromPlanPolicy(policy, { activePersonnelCount: 20 });

		expect(tier).toMatchObject({
			personnelCount: 20,
			personnelCap: 20,
			isReadOnly: false,
			readOnlyReason: null
		});
	});

	it('preserves the legacy unit compatibility cap for organizations already above 500 personnel', () => {
		const policy = buildEffectivePlanPolicy(
			snapshot({
				source: 'legacy_organization',
				commercialPlan: 'unit',
				stripeCustomerId: null,
				stripeSubscriptionId: null,
				stripeProductId: null,
				stripePriceId: null,
				subscriptionStatus: null,
				collectionStatus: null,
				syncStatus: 'not_configured'
			})
		);

		expect(toEffectiveTierFromPlanPolicy(policy, { activePersonnelCount: 600 })).toMatchObject({
			tier: 'unit',
			source: 'default',
			personnelCount: 600,
			personnelCap: 600,
			isReadOnly: false,
			readOnlyReason: null
		});
	});

	it('preserves gift expiry on the effective-tier compatibility path', () => {
		const policy = buildEffectivePlanPolicy(
			snapshot({
				source: 'gift',
				commercialPlan: 'unit',
				giftTier: 'unit',
				giftExpiresAt: '2999-01-01T00:00:00.000Z'
			})
		);

		expect(toEffectiveTierFromPlanPolicy(policy, { activePersonnelCount: 12 })).toMatchObject({
			source: 'gift',
			giftTier: 'unit',
			giftExpiresAt: '2999-01-01T00:00:00.000Z'
		});
	});

	it('preserves the actual gift tier when a stronger paid plan wins commercially', () => {
		const policy = buildEffectivePlanPolicy(
			snapshot({
				source: 'gift',
				commercialPlan: 'unit',
				giftTier: 'team',
				giftExpiresAt: '2999-01-01T00:00:00.000Z'
			})
		);

		expect(toEffectiveTierFromPlanPolicy(policy, { activePersonnelCount: 12 })).toMatchObject({
			tier: 'unit',
			source: 'gift',
			giftTier: 'team',
			giftExpiresAt: '2999-01-01T00:00:00.000Z'
		});
	});

	it('allows organization creation when the owner has paid or gift policy headroom', () => {
		const unitPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'unit' }));
		const giftPolicy = buildEffectivePlanPolicy(
			snapshot({
				source: 'gift',
				commercialPlan: 'unit',
				giftTier: 'unit',
				giftExpiresAt: '2999-01-01T00:00:00.000Z'
			})
		);

		expect(checkCanCreateOrganizationForPlanPolicies({ ownedOrganizationCount: 0, policies: [unitPolicy] })).toEqual({
			allowed: true
		});
		expect(checkCanCreateOrganizationForPlanPolicies({ ownedOrganizationCount: 0, policies: [giftPolicy] })).toEqual({
			allowed: true
		});
	});

	it('denies organization creation when the highest effective policy ownership cap is filled', () => {
		const freePolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }));
		const teamPolicy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'team' }));

		expect(
			checkCanCreateOrganizationForPlanPolicies({ ownedOrganizationCount: 1, policies: [freePolicy, teamPolicy] })
		).toEqual({
			allowed: false,
			message: 'You can own up to 1 organization(s) on your current plan.'
		});
	});

	it('allows first organization creation when the owner has no existing policies', () => {
		expect(checkCanCreateOrganizationForPlanPolicies({ ownedOrganizationCount: 0, policies: [] })).toEqual({
			allowed: true
		});
	});

	it('lets an active admin feature override grant a feature independently from the base plan', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }), {
			featureOverrides: [
				{
					id: 'override-1',
					organizationId: 'org-1',
					featureKey: 'bulk_export_unlimited',
					state: 'granted',
					expiresAt: '2999-01-01T00:00:00.000Z'
				}
			],
			now: new Date('2026-05-24T00:00:00.000Z')
		});

		expect(policy.entitlements.bulk_export_unlimited).toMatchObject({
			available: true,
			source: 'feature_override',
			upgradeTarget: null,
			override: {
				id: 'override-1',
				state: 'granted',
				expiresAt: '2999-01-01T00:00:00.000Z'
			}
		});
		expect(policy.exportQuota).toMatchObject({
			limit: null,
			unlimited: true,
			upgradeTarget: null
		});
	});

	it('lets an active admin feature override deny a feature that the effective plan would include', () => {
		const policy = buildEffectivePlanPolicy(
			snapshot({
				source: 'gift',
				commercialPlan: 'unit',
				giftTier: 'unit',
				giftExpiresAt: '2999-01-01T00:00:00.000Z'
			}),
			{
				featureOverrides: [
					{
						id: 'override-2',
						organizationId: 'org-1',
						featureKey: 'bulk_export_unlimited',
						state: 'denied',
						expiresAt: null
					}
				],
				now: new Date('2026-05-24T00:00:00.000Z')
			}
		);

		expect(policy.entitlements.bulk_export_unlimited).toMatchObject({
			available: false,
			source: 'feature_override',
			upgradeTarget: null,
			override: {
				id: 'override-2',
				state: 'denied',
				expiresAt: null
			}
		});
	});

	it('ignores expired admin feature overrides when building entitlements', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' }), {
			featureOverrides: [
				{
					id: 'override-3',
					organizationId: 'org-1',
					featureKey: 'bulk_export_unlimited',
					state: 'granted',
					expiresAt: '2026-05-23T23:59:59.000Z'
				}
			],
			now: new Date('2026-05-24T00:00:00.000Z')
		});

		expect(policy.entitlements.bulk_export_unlimited).toMatchObject({
			available: false,
			source: 'stripe_billing',
			upgradeTarget: 'unit'
		});
		expect(policy.entitlements.bulk_export_unlimited).not.toHaveProperty('override');
	});

	it('explains Stripe-backed entitlements separately from legacy base-plan entitlements', () => {
		const stripePolicy = buildEffectivePlanPolicy(snapshot({ source: 'stripe', commercialPlan: 'unit' }));
		const legacyPolicy = buildEffectivePlanPolicy(
			snapshot({
				source: 'legacy_organization',
				commercialPlan: 'unit',
				stripeCustomerId: null,
				stripeSubscriptionId: null,
				stripeProductId: null,
				stripePriceId: null,
				subscriptionStatus: null,
				collectionStatus: null,
				syncStatus: 'not_configured'
			})
		);

		expect(stripePolicy.entitlements.bulk_export_unlimited.source).toBe('stripe_billing');
		expect(legacyPolicy.entitlements.bulk_export_unlimited.source).toBe('base_plan');
	});

	it('defines the free plan member cap and pending invitation policy in the central contract', () => {
		const policy = buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free', subscriptionStatus: null }));

		expect(policy.limits.activeOrganizationMembers).toMatchObject({
			limit: 2,
			enforcement: 'active_members_plus_pending_invitations'
		});
		expect(policy.limits.pendingInvitations).toMatchObject({
			countsTowardMemberLimit: true,
			excludedStatuses: expect.arrayContaining(['expired', 'declined', 'revoked', 'blocked', 'accepted'])
		});
	});

	it('pins commercial member-seat caps in the central plan policy contract', () => {
		expect(buildEffectivePlanPolicy(snapshot({ commercialPlan: 'free' })).limits.activeOrganizationMembers.limit).toBe(
			2
		);
		expect(
			buildEffectivePlanPolicy(snapshot({ commercialPlan: 'team' })).limits.activeOrganizationMembers.limit
		).toBeNull();
		expect(
			buildEffectivePlanPolicy(snapshot({ commercialPlan: 'unit' })).limits.activeOrganizationMembers.limit
		).toBeNull();
	});

	it('uses the billing-state read interface instead of provider-specific billing APIs', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'free',
				gift_tier: null,
				gift_expires_at: null
			}
		]);
		ctx.rawStore.seed('organization_billing_snapshots', [
			{
				id: 'snapshot-1',
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'team',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				stripe_product_id: 'prod_team',
				stripe_price_id: 'price_team',
				subscription_status: 'active',
				collection_status: 'current',
				current_period_start: null,
				current_period_end: null,
				cancel_at_period_end: false,
				canceled_at: null,
				trial_end: null,
				sync_status: 'synced',
				last_stripe_event_id: null,
				last_stripe_event_type: null,
				last_stripe_event_created_at: null,
				last_processed_at: null,
				last_reconciled_at: null,
				reconciliation_result: null,
				drift_detected: false
			}
		]);

		const policy = await readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore });

		expect(policy).toMatchObject({
			commercialPlan: 'team',
			source: 'billing_snapshot',
			limits: {
				activePersonnel: { limit: 80 },
				activeOrganizationMembers: { limit: null },
				ownedOrganizations: { limit: 1 }
			}
		});
	});

	it('includes active persisted feature overrides in the effective policy read model', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'free',
				gift_tier: null,
				gift_expires_at: null
			}
		]);
		ctx.rawStore.seed('organization_billing_snapshots', [
			{
				id: 'snapshot-1',
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'free',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				stripe_product_id: 'prod_free',
				stripe_price_id: 'price_free',
				subscription_status: 'active',
				collection_status: 'current',
				current_period_start: null,
				current_period_end: null,
				cancel_at_period_end: false,
				canceled_at: null,
				trial_end: null,
				sync_status: 'synced',
				last_stripe_event_id: null,
				last_stripe_event_type: null,
				last_stripe_event_created_at: null,
				last_processed_at: null,
				last_reconciled_at: null,
				reconciliation_result: null,
				drift_detected: false
			}
		]);
		ctx.rawStore.seed('organization_plan_feature_overrides', [
			{
				id: 'override-1',
				organization_id: 'org-1',
				feature_key: 'bulk_export_unlimited',
				override_state: 'granted',
				expires_at: '2999-01-01T00:00:00.000Z',
				revoked_at: null
			}
		]);

		const policy = await readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore });

		expect(policy.entitlements.bulk_export_unlimited).toMatchObject({
			available: true,
			source: 'feature_override',
			override: {
				id: 'override-1',
				state: 'granted',
				expiresAt: '2999-01-01T00:00:00.000Z'
			}
		});
		expect(policy.exportQuota).toMatchObject({
			limit: null,
			unlimited: true,
			upgradeTarget: null
		});
	});

	it('includes active persisted feature overrides for billing-disabled policy snapshots', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'free',
				gift_tier: null,
				gift_expires_at: null
			}
		]);
		ctx.rawStore.seed('organization_billing_snapshots', [
			{
				id: 'snapshot-1',
				organization_id: 'org-1',
				source: 'billing_disabled',
				commercial_plan: 'free',
				stripe_customer_id: null,
				stripe_subscription_id: null,
				stripe_product_id: null,
				stripe_price_id: null,
				subscription_status: null,
				collection_status: null,
				current_period_start: null,
				current_period_end: null,
				cancel_at_period_end: false,
				canceled_at: null,
				trial_end: null,
				sync_status: 'billing_disabled',
				last_stripe_event_id: null,
				last_stripe_event_type: null,
				last_stripe_event_created_at: null,
				last_processed_at: null,
				last_reconciled_at: null,
				reconciliation_result: null,
				drift_detected: false
			}
		]);
		ctx.rawStore.seed('organization_plan_feature_overrides', [
			{
				id: 'override-1',
				organization_id: 'org-1',
				feature_key: 'bulk_export_unlimited',
				override_state: 'granted',
				expires_at: '2999-01-01T00:00:00.000Z',
				revoked_at: null
			}
		]);

		const policy = await readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore });

		expect(policy.source).toBe('billing_disabled_fallback');
		expect(policy.entitlements.bulk_export_unlimited).toMatchObject({
			available: true,
			source: 'feature_override',
			override: {
				id: 'override-1',
				state: 'granted',
				expiresAt: '2999-01-01T00:00:00.000Z'
			}
		});
	});

	it('ignores expired persisted feature overrides in the effective policy read model', async () => {
		billingEnabledMock.mockReturnValue(true);
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		ctx.rawStore.seed('organizations', [
			{
				id: 'org-1',
				tier: 'free',
				gift_tier: null,
				gift_expires_at: null
			}
		]);
		ctx.rawStore.seed('organization_billing_snapshots', [
			{
				id: 'snapshot-1',
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'free',
				stripe_customer_id: 'cus_123',
				stripe_subscription_id: 'sub_123',
				stripe_product_id: 'prod_free',
				stripe_price_id: 'price_free',
				subscription_status: 'active',
				collection_status: 'current',
				current_period_start: null,
				current_period_end: null,
				cancel_at_period_end: false,
				canceled_at: null,
				trial_end: null,
				sync_status: 'synced',
				last_stripe_event_id: null,
				last_stripe_event_type: null,
				last_stripe_event_created_at: null,
				last_processed_at: null,
				last_reconciled_at: null,
				reconciliation_result: null,
				drift_detected: false
			}
		]);
		ctx.rawStore.seed('organization_plan_feature_overrides', [
			{
				id: 'override-1',
				organization_id: 'org-1',
				feature_key: 'bulk_export_unlimited',
				override_state: 'granted',
				expires_at: '2000-01-01T00:00:00.000Z',
				revoked_at: null
			}
		]);

		const policy = await readEffectivePlanPolicy({ auth: ctx.auth, store: ctx.rawStore });

		expect(policy.entitlements.bulk_export_unlimited).toMatchObject({
			available: false,
			source: 'stripe_billing',
			upgradeTarget: 'unit'
		});
		expect(policy.entitlements.bulk_export_unlimited).not.toHaveProperty('override');
	});
});
