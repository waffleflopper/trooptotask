// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn(() => Promise.resolve())
}));

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	window.location.href = 'http://localhost/';
});

const baseData = {
	...createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'Test Org' }),
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
		giftExpiresAt: null
	},
	pendingCheckoutSession: null,
	tierComparison: [
		{
			tier: 'free',
			name: 'Free',
			personnelCap: 20,
			activeUserCap: 2,
			bulkExportsPerMonth: 3,
			priceMonthly: 0
		},
		{
			tier: 'team',
			name: 'Team',
			personnelCap: 80,
			activeUserCap: null,
			bulkExportsPerMonth: 10,
			priceMonthly: 499
		},
		{
			tier: 'unit',
			name: 'Unit',
			personnelCap: 500,
			activeUserCap: null,
			bulkExportsPerMonth: null,
			priceMonthly: 1099
		}
	],
	cancellationSummary: {
		state: 'none',
		label: 'Not scheduled',
		description: 'No cancellation is currently scheduled in the billing snapshot.',
		currentPeriodEnd: null,
		canceledAt: null
	},
	planUsageSummary: {
		plan: {
			tier: 'team',
			source: 'billing_snapshot',
			sourceLabel: 'Paid subscription'
		},
		rows: [
			{
				dimension: 'active_personnel',
				label: 'Personnel',
				used: 12,
				limit: 75,
				limitLabel: '75',
				status: 'within_limit',
				message: 'Personnel usage is 12 of 75.',
				remediation: 'Archive personnel or upgrade to Unit.',
				upgradeTarget: 'unit'
			},
			{
				dimension: 'active_organization_members',
				label: 'Members',
				used: 2,
				limit: null,
				limitLabel: 'Unlimited',
				status: 'within_limit',
				message: 'Member usage is 2 of Unlimited.',
				remediation: 'Remove members or contact support.',
				upgradeTarget: null
			},
			{
				dimension: 'pending_invitations',
				label: 'Pending invitations',
				used: 0,
				limit: null,
				limitLabel: 'Unlimited',
				status: 'within_limit',
				message: 'Pending invitations use 0 seats; 2 of Unlimited member seats are reserved.',
				remediation: 'Revoke pending invitations or contact support.',
				upgradeTarget: null
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
		alerts: []
	},
	downgradePreviews: []
};

function getSubscriptionCard(): HTMLElement {
	const card = screen.getByRole('heading', { name: 'Subscription' }).closest('[data-slot="card"]');
	if (!card) throw new Error('Subscription card was not rendered');
	return card as HTMLElement;
}

function freeDefaultData() {
	return {
		...baseData,
		canManageSubscription: false,
		effectiveTier: {
			...baseData.effectiveTier,
			tier: 'free',
			source: 'default',
			personnelCount: 0,
			personnelCap: 20,
			isReadOnly: false,
			readOnlyReason: null
		},
		billingSnapshot: null,
		planUsageSummary: null
	};
}

describe('billing page toolbar', () => {
	it.each([
		['active', 'The paid subscription is active and TroopToTask is applying the paid plan.', 'Active'],
		['trialing', 'The subscription trial is active.', 'Trialing'],
		[
			'past_due',
			'The renewal payment did not go through. Paid access may be read-only until the payment method is updated.',
			'Past Due'
		],
		['unpaid', 'The subscription is unpaid, so TroopToTask is blocking paid writes.', 'Unpaid'],
		[
			'canceled',
			'This subscription is canceled, so paid access has ended unless another access source applies.',
			'Canceled'
		],
		[
			'incomplete',
			'Checkout has not finished activating this subscription. Complete checkout to activate paid access.',
			'Payment Pending'
		],
		['incomplete_expired', 'The pending checkout expired before payment completed.', 'Checkout Expired'],
		['paused', 'This subscription is paused. Current policy keeps paid access available.', 'Paused']
	])('shows owner-safe status copy for %s subscriptions', (subscriptionStatus, description, statusLabel) => {
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

		const subscriptionCard = within(getSubscriptionCard());
		expect(subscriptionCard.getByText(description)).toBeTruthy();
		expect(subscriptionCard.getAllByText(statusLabel).length).toBeGreaterThan(0);
	});

	it.each([
		['past_due', 'Payment recovery needed', 'Grace access may be read-only', 'Update Payment Method', false],
		['unpaid', 'Payment is required', 'Paid-plan writes are blocked', 'Open Billing Portal', true],
		['canceled', 'Paid access ended', 'New work follows Free plan limits', null, true],
		[
			'incomplete',
			'Checkout still needs attention',
			'Paid capacity starts only after checkout completes',
			'Review Billing Details',
			false
		],
		['incomplete_expired', 'Checkout expired', 'No paid access was activated', null, true]
	])(
		'shows payment recovery guidance for %s without provider jargon',
		(subscriptionStatus, title, impact, portalLabel, showsPlansLink) => {
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
			expect(screen.getByText(new RegExp(impact))).toBeTruthy();
			expect(screen.getAllByText(/Existing data remains visible/).length).toBeGreaterThan(0);
			expect(screen.queryByText(/Stripe reports/)).toBeNull();

			if (showsPlansLink) {
				expect(screen.getByRole('link', { name: 'View Plans' }).getAttribute('href')).toBe('#billing-pricing-heading');
			} else {
				expect(screen.queryByRole('link', { name: 'View Plans' })).toBeNull();
			}
		}
	);

	it('shows recovery guidance within the subscription card when the subscription is canceled', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					billingSnapshot: {
						...baseData.billingSnapshot,
						subscriptionStatus: 'canceled'
					}
				} as never
			}
		});

		expect(screen.getByText('Paid access ended')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'View Plans' })).toBeTruthy();
	});

	it.each(['canceled', 'incomplete_expired'])(
		'shows fresh checkout controls instead of cancellation controls for ended %s paid snapshots',
		(subscriptionStatus) => {
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

			expect(screen.getByRole('button', { name: 'Upgrade to Unit' })).toBeTruthy();
			expect(screen.queryByRole('heading', { name: 'Cancel Subscription' })).toBeNull();
			expect(screen.queryByRole('button', { name: 'Cancel Now' })).toBeNull();
		}
	);

	it.each([
		['past_due', 'Payment recovery needed', 'Grace access may be read-only'],
		['unpaid', 'Payment is required', 'Paid-plan writes are blocked'],
		['canceled', 'Paid access ended', 'New work follows Free plan limits'],
		['incomplete', 'Checkout still needs attention', 'Paid capacity starts only after checkout completes'],
		['incomplete_expired', 'Checkout expired', 'No paid access was activated']
	])(
		'shows %s payment recovery guidance even when portal access is unavailable',
		(subscriptionStatus, title, impact) => {
			render(Page, {
				props: {
					data: {
						...baseData,
						canManageSubscription: false,
						billingSnapshot: {
							...baseData.billingSnapshot,
							subscriptionStatus
						}
					} as never
				}
			});

			expect(screen.getByText(title)).toBeTruthy();
			expect(screen.getByText(new RegExp(impact))).toBeTruthy();
			expect(screen.queryByRole('toolbar', { name: 'Billing controls' })).toBeNull();
		}
	);

	it('distinguishes suspended past-due access from grace-mode past-due access', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					canManageSubscription: false,
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

		expect(screen.getByText('Payment recovery needed')).toBeTruthy();
		expect(
			screen.getByText('Paid access is suspended and paid-plan writes are blocked until billing is restored.')
		).toBeTruthy();
	});

	it('provides billing portal access through the subscription card header for active subscriptions', () => {
		render(Page, {
			props: {
				data: baseData as never
			}
		});

		expect(within(getSubscriptionCard()).getByRole('button', { name: 'Manage Subscription' })).toBeTruthy();
	});

	it('shows the exact launch prices on authenticated plan cards', () => {
		render(Page, {
			props: {
				data: baseData as never
			}
		});

		expect(screen.getByText('$4.99/mo')).toBeTruthy();
		expect(screen.getByText('$10.99/mo')).toBeTruthy();
		expect(screen.queryByText('$5/mo')).toBeNull();
		expect(screen.queryByText('$11/mo')).toBeNull();
	});

	it('shows Free-first upgrade choices for self-service owners without trial copy', () => {
		render(Page, {
			props: {
				data: freeDefaultData() as never
			}
		});

		expect(screen.getByText(/explicit Team or Unit upgrades/)).toBeTruthy();
		expect(screen.getByText(/New Organizations can stay on Free/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Current Plan' })).toBeTruthy();
		expect(screen.getByText('$4.99/mo')).toBeTruthy();
		expect(screen.getByText('$10.99/mo')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Upgrade to Team' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Upgrade to Unit' })).toBeTruthy();
		expect(screen.queryByText(/Start Trial/i)).toBeNull();
	});

	it('keeps Free-first upgrade choices when a free billing snapshot is active', () => {
		render(Page, {
			props: {
				data: {
					...freeDefaultData(),
					canManageSubscription: true,
					billingSnapshot: {
						...baseData.billingSnapshot,
						commercialPlan: 'free',
						stripeSubscriptionId: 'sub_free',
						stripeProductId: null,
						stripePriceId: null,
						subscriptionStatus: 'active',
						currentPeriodEnd: null
					}
				} as never
			}
		});

		expect(screen.getByText('No active paid subscription is currently applied to this organization.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Upgrade to Team' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Upgrade to Unit' })).toBeTruthy();
		expect(screen.queryByText('The paid subscription is active and TroopToTask is applying the paid plan.')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Manage Subscription' })).toBeNull();
		expect(screen.queryByRole('heading', { name: 'Cancel Subscription' })).toBeNull();
	});

	it('keeps billing portal recovery visible for unpaid snapshots downgraded to Free', () => {
		render(Page, {
			props: {
				data: {
					...freeDefaultData(),
					canManageSubscription: true,
					stripeCustomerId: 'cus_123',
					subscriptionStripeId: 'sub_123',
					effectiveTier: {
						...baseData.effectiveTier,
						tier: 'free',
						source: 'default',
						isReadOnly: true,
						readOnlyReason: 'billing_state'
					},
					billingSnapshot: {
						...baseData.billingSnapshot,
						commercialPlan: 'free',
						subscriptionStatus: 'unpaid',
						collectionStatus: 'unpaid',
						stripeCustomerId: 'cus_123',
						stripeSubscriptionId: 'sub_123',
						stripeProductId: null,
						stripePriceId: null
					}
				} as never
			}
		});

		const subscriptionCard = within(getSubscriptionCard());
		expect(
			subscriptionCard.getByText(
				'The subscription is unpaid, so this organization is on the free plan until billing is restored.'
			)
		).toBeTruthy();
		expect(subscriptionCard.getByRole('button', { name: 'Manage Subscription' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Upgrade to Team' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Upgrade to Unit' })).toBeTruthy();
		expect(screen.queryByRole('heading', { name: 'Cancel Subscription' })).toBeNull();
	});

	it('starts Team checkout from the Free plan with server-side tier selection', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ url: 'https://checkout.test/team' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			props: {
				data: freeDefaultData() as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Team' }));
		expect(screen.getByRole('heading', { name: 'Upgrade to Team' })).toBeTruthy();
		expect(screen.getByText(/remains on its current plan until checkout is complete/)).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/billing/checkout', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ tier: 'team' })
			})
		);
		expect(window.location.href).toBe('https://checkout.test/team');
	});

	it('shows policy-backed usage limits and remediation actions', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					planUsageSummary: {
						...baseData.planUsageSummary,
						rows: [
							{
								...baseData.planUsageSummary.rows[0],
								used: 21,
								limit: 20,
								limitLabel: '20',
								status: 'over_limit',
								message: 'Personnel usage is 21 of 20.',
								remediation: 'Archive personnel or upgrade to Team.',
								upgradeTarget: 'team'
							},
							{
								...baseData.planUsageSummary.rows[1],
								used: 3,
								limit: 2,
								limitLabel: '2',
								status: 'over_limit',
								message: 'Member usage is 3 of 2.',
								remediation: 'Remove members or upgrade to Team.',
								upgradeTarget: 'team'
							},
							{
								...baseData.planUsageSummary.rows[2],
								used: 1,
								limit: 2,
								limitLabel: '2',
								status: 'limit_reached',
								message: 'Pending invitations use 1 seat; 2 of 2 member seats are reserved.',
								remediation: 'Revoke pending invitations or upgrade to Team.',
								upgradeTarget: 'team'
							},
							{
								...baseData.planUsageSummary.rows[3],
								used: 3,
								limit: 3,
								limitLabel: '3',
								status: 'limit_reached',
								message: 'Export usage is 3 of 3 this month.',
								remediation: 'Upgrade to Team for more monthly exports or wait until next month.',
								upgradeTarget: 'team'
							}
						],
						alerts: [
							{
								dimension: 'active_personnel',
								label: 'Personnel',
								message: 'Personnel usage is 21 of 20.',
								remediation: 'Archive personnel or upgrade to Team.',
								status: 'over_limit'
							},
							{
								dimension: 'active_organization_members',
								label: 'Members',
								message: 'Member usage is 3 of 2.',
								remediation: 'Remove members or upgrade to Team.',
								status: 'over_limit'
							},
							{
								dimension: 'pending_invitations',
								label: 'Pending invitations',
								message: 'Pending invitations use 1 seat; 2 of 2 member seats are reserved.',
								remediation: 'Revoke pending invitations or upgrade to Team.',
								status: 'limit_reached'
							},
							{
								dimension: 'monthly_exports',
								label: 'Monthly exports',
								message: 'Export usage is 3 of 3 this month.',
								remediation: 'Upgrade to Team for more monthly exports or wait until next month.',
								status: 'limit_reached'
							}
						]
					}
				} as never
			}
		});

		expect(screen.getByRole('heading', { name: 'Usage & Limits' })).toBeTruthy();
		expect(screen.getByText('Paid subscription')).toBeTruthy();
		expect(screen.getByText('21 / 20')).toBeTruthy();
		expect(screen.getByText('3 / 2')).toBeTruthy();
		expect(screen.getByText('1 / 2')).toBeTruthy();
		expect(screen.getByText('3 / 3')).toBeTruthy();
		expect(screen.getByText('Archive personnel or upgrade to Team.')).toBeTruthy();
		expect(screen.getByText('Remove members or upgrade to Team.')).toBeTruthy();
		expect(screen.getByText('Revoke pending invitations or upgrade to Team.')).toBeTruthy();
		expect(screen.getByText('Upgrade to Team for more monthly exports or wait until next month.')).toBeTruthy();
		expect(screen.getByText('Existing data remains visible. Resolve limits before adding more data.')).toBeTruthy();
		expect(screen.getByText(/member invitations, exports, or paid-plan writes can be blocked/)).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Open Personnel' }).getAttribute('href')).toBe('/org/org-1/personnel');
		expect(screen.getByRole('link', { name: 'Manage Members' }).getAttribute('href')).toBe('/org/org-1/settings');
		expect(screen.getByRole('link', { name: 'Compare Plans' }).getAttribute('href')).toBe('#billing-pricing-heading');
		expect(screen.getByRole('link', { name: 'Contact Support' }).getAttribute('href')).toBe(
			'mailto:support@trooptotask.org'
		);
	});

	it('names billing-state blocks separately from usage-limit blocks', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					planUsageSummary: {
						...baseData.planUsageSummary,
						alerts: [
							{
								dimension: 'billing_state',
								label: 'Billing state',
								message: 'Organization billing is not currently active.',
								remediation: 'Restore the subscription or choose a current plan.',
								status: 'read_only'
							}
						]
					}
				} as never
			}
		});

		expect(screen.getByText('Existing data remains visible. Resolve billing before adding more data.')).toBeTruthy();
		expect(screen.queryByText('Existing data remains visible. Resolve limits before adding more data.')).toBeNull();
	});

	it('shows downgrade preview remediation on lower-plan cards', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					effectiveTier: {
						...baseData.effectiveTier,
						tier: 'unit',
						personnelCount: 90,
						personnelCap: 500
					},
					planUsageSummary: {
						...baseData.planUsageSummary,
						plan: {
							...baseData.planUsageSummary.plan,
							tier: 'unit'
						}
					},
					downgradePreviews: [
						{
							currentPlan: {
								tier: 'unit',
								sourceLabel: 'Paid subscription'
							},
							targetPlan: {
								tier: 'free',
								name: 'Free',
								sourceLabel: 'Paid subscription'
							},
							status: 'blocked',
							preservesExistingDataMessage:
								'Existing data is preserved after downgrade, but over-limit usage, unavailable features, or read-only billing states can block new writes until resolved.',
							rows: [
								{
									dimension: 'active_personnel',
									label: 'Personnel',
									used: 90,
									limit: 20,
									limitLabel: '20',
									status: 'over_limit',
									message: 'Personnel usage would be 90 of 20 on Free.',
									remediation: 'Archive personnel before downgrading or choose Team.',
									upgradeTarget: 'team'
								}
							],
							featureLosses: [
								{
									featureKey: 'bulk_export_unlimited',
									label: 'Unlimited bulk exports',
									message: 'Unlimited bulk exports is available on the current plan but not on Free.',
									remediation: 'Choose Unit to keep Unlimited bulk exports.',
									upgradeTarget: 'unit'
								}
							],
							blockers: [
								{
									dimension: 'active_personnel',
									label: 'Personnel',
									used: 90,
									limit: 20,
									limitLabel: '20',
									status: 'over_limit',
									message: 'Personnel usage would be 90 of 20 on Free.',
									remediation: 'Archive personnel before downgrading or choose Team.',
									upgradeTarget: 'team'
								},
								{
									featureKey: 'bulk_export_unlimited',
									label: 'Unlimited bulk exports',
									message: 'Unlimited bulk exports is available on the current plan but not on Free.',
									remediation: 'Choose Unit to keep Unlimited bulk exports.',
									upgradeTarget: 'unit'
								}
							]
						}
					]
				} as never
			}
		});

		expect(screen.getByText('Downgrade preview')).toBeTruthy();
		expect(screen.getByText('Needs remediation')).toBeTruthy();
		expect(screen.getByText(/Existing data is preserved after downgrade/)).toBeTruthy();
		expect(screen.getByText(/Personnel usage would be 90 of 20 on Free/)).toBeTruthy();
		expect(screen.getByText('Archive personnel before downgrading or choose Team.')).toBeTruthy();
		expect(screen.getByText('Choose Unit to keep Unlimited bulk exports.')).toBeTruthy();
	});

	it('uses the effective tier when past-due access has already been downgraded', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					canManageSubscription: false,
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

		expect(
			screen.getByText(
				'The renewal payment did not go through. Access has been downgraded to the free plan until billing is restored.'
			)
		).toBeTruthy();
		expect(screen.getByText(/downgraded to the free plan/)).toBeTruthy();
	});

	it('shows current billing update status after reconciliation repaired drift', () => {
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

		expect(screen.getAllByText('Current').length).toBeGreaterThan(0);
	});

	it('renders the subscription card for reconciliation states without surfacing internal sync details', () => {
		render(Page, {
			props: {
				data: {
					...baseData,
					billingSnapshot: {
						...baseData.billingSnapshot,
						syncStatus: 'needs_reconciliation',
						driftDetected: true
					}
				} as never
			}
		});

		expect(screen.getByRole('heading', { name: 'Subscription' })).toBeTruthy();
		expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
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

		expect(
			screen.getByText('An admin gift is currently granting this organization access outside regular billing.')
		).toBeTruthy();
		expect(screen.getAllByText(/outside regular billing/).length).toBeGreaterThan(0);
	});

	it('shows billing-disabled fallback state and hides paid recovery actions', () => {
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

		expect(
			screen.getByText('Billing actions are hidden because paid billing is turned off for this environment.')
		).toBeTruthy();
		expect(screen.queryByRole('toolbar', { name: 'Billing controls' })).toBeNull();
		expect(screen.getAllByRole('button', { name: 'Billing Disabled' }).length).toBeGreaterThan(0);
	});

	it('hides paid recovery actions when the effective tier source is billing-disabled without a snapshot', () => {
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
					billingSnapshot: null
				} as never
			}
		});

		expect(
			screen.getByText('Billing actions are hidden because paid billing is turned off for this environment.')
		).toBeTruthy();
		expect(screen.queryByRole('toolbar', { name: 'Billing controls' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Manage Subscription' })).toBeNull();
	});

	it('exposes subscription management in the card header with cancellation controls below', () => {
		render(Page, {
			props: {
				data: baseData as never
			}
		});

		expect(within(getSubscriptionCard()).getByRole('button', { name: 'Manage Subscription' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Cancel Subscription' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Cancel at Period End' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Cancel Now' })).toBeTruthy();
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

	it('surfaces an active checkout with continue and cancel actions', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ success: true, canceled: true, checkoutAttemptId: 'attempt-unit' }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			props: {
				data: {
					...baseData,
					canManageSubscription: false,
					billingSnapshot: null,
					effectiveTier: {
						...baseData.effectiveTier,
						tier: 'free',
						source: 'default'
					},
					pendingCheckoutSession: {
						id: 'attempt-unit',
						tier: 'unit',
						checkoutUrl: 'https://checkout.test/unit',
						expiresAt: '2026-05-26T04:03:56.000Z',
						createdAt: '2026-05-25T04:03:55.000Z'
					}
				} as never
			}
		});

		expect(screen.getByText('Unit checkout is already open.')).toBeTruthy();
		expect(screen.getByText(/This checkout expires on/)).toBeTruthy();
		expect(screen.getAllByRole('button', { name: 'Continue Checkout' }).length).toBeGreaterThan(0);
		expect(screen.getByRole('button', { name: 'Cancel Pending Checkout' })).toBeTruthy();
		expect(screen.getAllByRole('button', { name: 'Pending Checkout' }).length).toBeGreaterThan(0);

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel Pending Checkout' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/billing/checkout/cancel', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' }
		});
	});

	it('keeps subscription actions disabled while requests are in flight', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => new Promise<Response>(() => {}))
		);

		render(Page, {
			props: {
				data: baseData as never
			}
		});

		const subscriptionCard = within(getSubscriptionCard());

		await fireEvent.click(subscriptionCard.getByRole('button', { name: 'Manage Subscription' }));
		expect((subscriptionCard.getByRole('button', { name: /Opening/ }) as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel Now' }));
		await fireEvent.input(screen.getByLabelText('Type CANCEL NOW to confirm'), { target: { value: 'CANCEL NOW' } });
		await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel Now' }));
		expect(
			(within(screen.getByRole('dialog')).getByRole('button', { name: /Canceling/ }) as HTMLButtonElement).disabled
		).toBe(true);
	});

	it('requires explicit immediate cancellation confirmation before submitting the immediate path', async () => {
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(JSON.stringify({ success: true }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			})
		);
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			props: {
				data: baseData as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Cancel Now' }));
		expect(
			(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel Now' }) as HTMLButtonElement).disabled
		).toBe(true);

		expect(fetchMock).not.toHaveBeenCalled();

		await fireEvent.input(screen.getByLabelText('Type CANCEL NOW to confirm'), { target: { value: 'CANCEL NOW' } });
		expect(
			(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel Now' }) as HTMLButtonElement).disabled
		).toBe(false);
		await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel Now' }));

		expect(fetchMock).toHaveBeenCalledWith('/org/org-1/billing/cancel', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				confirmedImmediateCancellation: true,
				cancellationFeedback: null
			})
		});
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cancel paid access now' })).toBeNull());
	});

	it('opens password confirmation when checkout requires sensitive-action step-up', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						error: 'Please confirm your identity before continuing.',
						requiresStepUp: true,
						stepUpPath: '/auth/login'
					}),
					{ status: 403, headers: { 'Content-Type': 'application/json' } }
				)
			)
		);

		render(Page, {
			props: {
				data: {
					...baseData,
					canManageSubscription: false,
					billingSnapshot: null,
					effectiveTier: {
						...baseData.effectiveTier,
						tier: 'free',
						source: 'default'
					}
				} as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Team' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

		expect(screen.getByText('Confirm your password')).toBeTruthy();
		expect(screen.getByLabelText('Password')).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Upgrade to Team' }) as HTMLButtonElement).disabled).toBe(false);
	});

	it('redirects to MFA verification when checkout requires MFA step-up', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(
					JSON.stringify({
						error: 'Please confirm your identity before continuing.',
						requiresStepUp: true,
						stepUpPath: '/auth/mfa-verify'
					}),
					{ status: 403, headers: { 'Content-Type': 'application/json' } }
				)
			)
		);

		render(Page, {
			props: {
				data: {
					...baseData,
					canManageSubscription: false,
					billingSnapshot: null,
					effectiveTier: {
						...baseData.effectiveTier,
						tier: 'free',
						source: 'default'
					}
				} as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Team' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Continue to Checkout' }));

		expect(window.location.pathname).toBe('/auth/mfa-verify');
		expect(window.location.search).toBe('?next=%2F');
		expect(screen.queryByText('Confirm your password')).toBeNull();
	});

	it('shows password confirmation errors without leaving the billing page', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						error: 'Please confirm your identity before continuing.',
						requiresStepUp: true,
						stepUpPath: '/auth/login'
					}),
					{ status: 403, headers: { 'Content-Type': 'application/json' } }
				)
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: 'Password confirmation failed. Try again.' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			props: {
				data: {
					...baseData,
					canManageSubscription: false,
					billingSnapshot: null,
					effectiveTier: {
						...baseData.effectiveTier,
						tier: 'free',
						source: 'default'
					}
				} as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Team' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Continue to Checkout' }));
		await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

		expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/confirm-sensitive-action', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password: 'wrong-password' })
		});
		expect(screen.getByText('Password confirmation failed. Try again.')).toBeTruthy();
		expect(screen.getByRole('dialog')).toBeTruthy();
	});

	it('redirects to MFA verification when password confirmation requires MFA step-up', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(
					JSON.stringify({
						error: 'Please confirm your identity before continuing.',
						requiresStepUp: true,
						stepUpPath: '/auth/login'
					}),
					{ status: 403, headers: { 'Content-Type': 'application/json' } }
				)
			)
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
			);
		vi.stubGlobal('fetch', fetchMock);

		render(Page, {
			props: {
				data: {
					...baseData,
					canManageSubscription: false,
					billingSnapshot: null,
					effectiveTier: {
						...baseData.effectiveTier,
						tier: 'free',
						source: 'default'
					}
				} as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Team' }));
		await fireEvent.click(screen.getByRole('button', { name: 'Continue to Checkout' }));
		await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'correct-password' } });
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

		expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/confirm-sensitive-action', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ password: 'correct-password' })
		});
		expect(window.location.pathname).toBe('/auth/mfa-verify');
		expect(window.location.search).toBe('?next=%2F');
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
							'Paid access remains active until the paid-through date unless the provider reports an earlier terminal state.',
						currentPeriodEnd: '2026-06-01T00:00:00.000Z',
						canceledAt: null
					}
				} as never
			}
		});

		expect(screen.getByText('Your subscription is scheduled to cancel.')).toBeTruthy();
		expect(screen.getByText(/Paid access remains active through June 1, 2026/)).toBeTruthy();
		const statusFact = screen.getByText('Status').closest('[data-slot="fact-row"]');
		expect(statusFact?.hasAttribute('role')).toBe(false);
		expect(statusFact?.closest('[data-slot="fact-grid"]')?.hasAttribute('role')).toBe(false);
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

describe('password confirmation completion', () => {
	async function openConfirmation(
		fetchMock: ReturnType<typeof vi.fn>,
		action: 'subscribe' | 'portal' | 'cancel' = 'portal'
	) {
		vi.stubGlobal('fetch', fetchMock);
		window.location.href = 'http://localhost/org/org-1/billing?from=settings';
		render(Page, {
			props: {
				data: (action === 'subscribe'
					? {
							...baseData,
							canManageSubscription: false,
							billingSnapshot: null,
							effectiveTier: { ...baseData.effectiveTier, tier: 'free', source: 'default' }
						}
					: baseData) as never
			}
		});
		if (action === 'subscribe') {
			await fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Unit' }));
			await fireEvent.click(screen.getByRole('button', { name: 'Continue to Checkout' }));
		} else if (action === 'cancel') {
			await fireEvent.click(screen.getByRole('button', { name: 'Cancel Now' }));
			await fireEvent.input(screen.getByLabelText('Type CANCEL NOW to confirm'), { target: { value: 'CANCEL NOW' } });
			await fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel Now' }));
		} else await fireEvent.click(within(getSubscriptionCard()).getByRole('button', { name: 'Manage Subscription' }));
		await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'preserved-password' } });
	}
	const denied = () =>
		new Response(JSON.stringify({ requiresStepUp: true, stepUpPath: '/auth/login' }), { status: 403 });
	it.each([
		{},
		{ success: false },
		{ success: 'true' },
		{ success: true, error: 'failed' },
		null,
		{ requiresStepUp: 'true' },
		{ requiresStepUp: true, stepUpPath: 'https://evil.invalid' }
	])('keeps the pending action and password on malformed confirmation %j, then retries', async (body) => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(denied())
			.mockResolvedValueOnce(new Response(JSON.stringify(body)))
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'provider unavailable' }), { status: 503 }));
		await openConfirmation(fetchMock);
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(screen.getByRole('dialog')).toBeTruthy();
		expect(screen.getByRole('alert')).toBeTruthy();
		expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('preserved-password');
		expect(window.location.pathname).toBe('/org/org-1/billing');
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		expect(fetchMock).toHaveBeenCalledTimes(4);
		expect(String(fetchMock.mock.calls[3][0])).toContain('/portal');
	});
	it.each(['network', 'non-json', 'http-failure'])('retains a retry after %s failure', async (failure) => {
		const fetchMock = vi.fn().mockResolvedValueOnce(denied());
		if (failure === 'network') fetchMock.mockRejectedValueOnce(new Error('offline'));
		else
			fetchMock.mockResolvedValueOnce(
				failure === 'non-json'
					? new Response('bad gateway')
					: new Response(JSON.stringify({ success: true }), { status: 503 })
			);
		fetchMock
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
			.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'provider unavailable' }), { status: 503 }));
		await openConfirmation(fetchMock);
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(screen.getByRole('alert')).toBeTruthy();
		expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('preserved-password');
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		expect(fetchMock).toHaveBeenCalledTimes(4);
	});
	it.each(['subscribe', 'portal', 'cancel'] as const)(
		'retries the original %s action exactly once after explicit confirmation',
		async (action) => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(denied())
				.mockResolvedValueOnce(new Response(JSON.stringify({ success: true })))
				.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'provider unavailable' }), { status: 503 }));
			await openConfirmation(fetchMock, action);
			const original = fetchMock.mock.calls[0];
			await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
			expect(fetchMock).toHaveBeenCalledTimes(3);
			expect(fetchMock.mock.calls[2]).toEqual(original);
		}
	);
	it('serializes pending submissions and prevents cancellation until confirmation finishes', async () => {
		let finish!: (response: Response) => void;
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(denied())
			.mockImplementationOnce(
				() =>
					new Promise<Response>((resolve) => {
						finish = resolve;
					})
			);
		await openConfirmation(fetchMock);
		const form = screen.getByLabelText('Password').closest('form')!;
		await fireEvent.submit(form);
		await fireEvent.submit(form);
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect((screen.getByLabelText('Password') as HTMLInputElement).disabled).toBe(true);
		expect(
			(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled
		).toBe(true);
		finish(new Response(JSON.stringify({ error: 'retry' }), { status: 503 }));
		await waitFor(() => expect((screen.getByLabelText('Password') as HTMLInputElement).disabled).toBe(false));
		expect(screen.getByRole('alert')).toBeTruthy();
	});
	it('continues to MFA with the original return URL and never retries a protected action before verification', async () => {
		const fetchMock = vi
			.fn()
			.mockResolvedValueOnce(denied())
			.mockResolvedValueOnce(new Response(JSON.stringify({ requiresStepUp: true, stepUpPath: '/auth/mfa-verify' })));
		await openConfirmation(fetchMock);
		await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(window.location.pathname).toBe('/auth/mfa-verify');
		expect(new URLSearchParams(window.location.search).get('next')).toBe('/org/org-1/billing?from=settings');
	});
});
