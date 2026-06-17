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
			key: 'bulk_export_unlimited',
			available: false,
			source: 'stripe_billing',
			upgradeTarget: 'unit'
		}
	]
};

const planDiagnostics = {
	effectivePlan: {
		commercialPlan: 'team',
		tier: 'team',
		source: 'billing_snapshot',
		sourceLabel: 'Local billing snapshot',
		billingSource: 'stripe',
		giftTier: null,
		giftExpiresAt: null
	},
	grace: {
		mode: 'none',
		message: null
	},
	readOnly: {
		enabled: false,
		reasons: []
	},
	usageRows: [
		{
			dimension: 'active_personnel',
			label: 'Personnel',
			used: 12,
			limit: 80,
			limitLabel: '80',
			status: 'within_limit',
			message: 'Personnel usage is 12 of 80.',
			remediation: 'Archive personnel or upgrade to Unit.',
			upgradeTarget: 'unit'
		},
		{
			dimension: 'active_organization_members',
			label: 'Members',
			used: 1,
			limit: 10,
			limitLabel: '10',
			status: 'within_limit',
			message: 'Member usage is 1 of 10.',
			remediation: 'Remove members or upgrade to Unit.',
			upgradeTarget: 'unit'
		},
		{
			dimension: 'pending_invitations',
			label: 'Pending invitations',
			used: 0,
			limit: 10,
			limitLabel: '10',
			status: 'within_limit',
			message: 'Pending invitations use 0 seats; 1 of 10 member seats are reserved.',
			remediation: 'Revoke pending invitations or upgrade to Unit.',
			upgradeTarget: 'unit'
		},
		{
			dimension: 'monthly_exports',
			label: 'Monthly exports',
			used: 0,
			limit: null,
			limitLabel: 'Unlimited',
			status: 'within_limit',
			message: 'Export usage is 0 of Unlimited this month.',
			remediation: 'Contact support or wait until next month.',
			upgradeTarget: null
		}
	],
	overLimitReasons: [],
	entitlements: [
		{
			key: 'bulk_export_unlimited',
			label: 'Unlimited bulk exports',
			description: 'Use advanced readiness and reporting workspaces.',
			available: false,
			source: 'stripe_billing',
			sourceLabel: 'Paid plan',
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
					planDiagnostics,
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
						lastStripeEventCreatedAt: '2026-05-15T00:00:30.000Z',
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
		expect(screen.getByText('Subscription Source')).toBeTruthy();
		expect(screen.getByText('Subscription Source').parentElement?.parentElement?.textContent).toContain(
			'Stripe subscription'
		);
		expect(screen.getByText('Entitlement Source').parentElement?.parentElement?.textContent).toContain(
			'Local billing snapshot'
		);
		expect(screen.getAllByText('Stripe').length).toBeGreaterThan(0);
		expect(screen.getByText('Cancels at period end')).toBeTruthy();
		expect(screen.getByText('customer.subscription.updated')).toBeTruthy();
		expect(screen.getByText('Last Event Created')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Refresh from Stripe' })).toBeTruthy();
		const reconciliationResult = screen.getByText('repaired_drift:current_period_start,current_period_end,canceled_at');
		expect(reconciliationResult).toBeTruthy();
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
					planDiagnostics,
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

	it('shows effective plan diagnostics, usage reasons, and entitlement source labels', () => {
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
					planDiagnostics: {
						...planDiagnostics,
						grace: {
							mode: 'payment_failed',
							message: 'Payment failed grace mode keeps the current plan visible while write access can be restricted.'
						},
						readOnly: {
							enabled: true,
							reasons: [
								{
									dimension: 'billing_state',
									label: 'Billing state',
									message: 'Billing is not current.',
									remediation: 'Update the payment method or contact support.',
									status: 'read_only',
									sourceLabel: 'Local billing snapshot'
								}
							]
						},
						usageRows: [
							{
								dimension: 'active_personnel',
								label: 'Personnel',
								used: 12,
								limit: 80,
								limitLabel: '80',
								status: 'within_limit',
								message: 'Personnel usage is 12 of 80.',
								remediation: 'Archive personnel or upgrade to Unit.',
								upgradeTarget: 'unit'
							},
							{
								dimension: 'active_organization_members',
								label: 'Members',
								used: 11,
								limit: 10,
								limitLabel: '10',
								status: 'over_limit',
								message: 'Member usage is 11 of 10.',
								remediation: 'Remove members or upgrade to Unit.',
								upgradeTarget: 'unit'
							},
							{
								dimension: 'pending_invitations',
								label: 'Pending invitations',
								used: 1,
								limit: 10,
								limitLabel: '10',
								status: 'over_limit',
								message: 'Pending invitations use 1 seat; 12 of 10 member seats are reserved.',
								remediation: 'Revoke pending invitations or upgrade to Unit.',
								upgradeTarget: 'unit'
							},
							{
								dimension: 'monthly_exports',
								label: 'Monthly exports',
								used: 2,
								limit: null,
								limitLabel: 'Unlimited',
								status: 'within_limit',
								message: 'Export usage is 2 of Unlimited this month.',
								remediation: 'Contact support or wait until next month.',
								upgradeTarget: null
							}
						],
						overLimitReasons: [
							{
								dimension: 'active_organization_members',
								label: 'Members',
								message: 'Member usage is 11 of 10.',
								remediation: 'Remove members or upgrade to Unit.',
								status: 'over_limit',
								sourceLabel: 'Local billing snapshot'
							},
							{
								dimension: 'pending_invitations',
								label: 'Pending invitations',
								message: 'Pending invitations use 1 seat; 12 of 10 member seats are reserved.',
								remediation: 'Revoke pending invitations or upgrade to Unit.',
								status: 'over_limit',
								sourceLabel: 'Local billing snapshot'
							},
							{
								dimension: 'billing_state',
								label: 'Billing state',
								message: 'Billing is not current.',
								remediation: 'Update the payment method or contact support.',
								status: 'read_only',
								sourceLabel: 'Local billing snapshot'
							}
						],
						entitlements: [
							{
								key: 'bulk_export_unlimited',
								label: 'Unlimited bulk exports',
								description: 'Use advanced readiness and reporting workspaces.',
								available: true,
								source: 'feature_override',
								sourceLabel: 'Feature override',
								upgradeTarget: null,
								override: {
									id: 'override-1',
									state: 'granted',
									expiresAt: null
								}
							}
						]
					},
					billingSnapshot: null,
					cancellationSummary: null
				} as never,
				form: null
			}
		});

		expect(screen.getByText('Plan Policy Diagnostics')).toBeTruthy();
		expect(screen.getAllByText('Local billing snapshot').length).toBeGreaterThan(0);
		expect(
			screen.getByText('Payment failed grace mode keeps the current plan visible while write access can be restricted.')
		).toBeTruthy();
		expect(screen.getAllByText('Member usage is 11 of 10.').length).toBeGreaterThan(0);
		expect(
			screen.getAllByText('Pending invitations use 1 seat; 12 of 10 member seats are reserved.').length
		).toBeGreaterThan(0);
		expect(screen.getByText('Billing is not current.')).toBeTruthy();
		expect(screen.getByText('Feature override')).toBeTruthy();
		expect(document.body.textContent).not.toContain('raw_payload');
	});
});
