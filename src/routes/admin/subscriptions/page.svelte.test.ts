// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('admin subscriptions page', () => {
	it('shows support-visible period-end cancellation timing from billing snapshots', () => {
		render(Page, {
			props: {
				data: {
					subscriptions: [
						{
							id: 'org-1',
							name: 'Alpha Company',
							effectiveTier: 'team',
							personnelCount: 12,
							personnelCap: 80,
							ownerEmail: 'owner@example.com',
							isGifted: false,
							isSuspended: false,
							gift_expires_at: null,
							created_at: '2026-05-01T00:00:00.000Z',
							cancellationSummary: {
								state: 'canceling_at_period_end',
								label: 'Cancels at period end',
								description:
									'Paid access remains active until the paid-through date unless Stripe reports an earlier terminal state.',
								currentPeriodEnd: '2026-06-01T00:00:00.000Z',
								canceledAt: null
							}
						}
					],
					pagination: {
						page: 1,
						pageSize: 25,
						totalCount: 1,
						totalPages: 1,
						q: ''
					},
					billingDiagnosticsError: false,
					planDiagnosticsError: false
				} as never
			}
		});

		expect(screen.getByText('Alpha Company')).toBeTruthy();
		expect(screen.getByText('Cancels at period end')).toBeTruthy();
		expect(screen.getByText(/paid through/)).toBeTruthy();
	});

	it('warns support staff when billing diagnostics cannot be loaded', () => {
		render(Page, {
			props: {
				data: {
					subscriptions: [],
					pagination: {
						page: 1,
						pageSize: 25,
						totalCount: 0,
						totalPages: 1,
						q: ''
					},
					billingDiagnosticsError: true,
					planDiagnosticsError: false
				} as never
			}
		});

		expect(screen.getByText('Billing diagnostics could not be loaded.')).toBeTruthy();
		expect(screen.getByText(/Cancellation timing may be incomplete/)).toBeTruthy();
	});

	it('surfaces billing drift health for support diagnostics', () => {
		render(Page, {
			props: {
				data: {
					subscriptions: [
						{
							id: 'org-1',
							name: 'Alpha Company',
							effectiveTier: 'team',
							personnelCount: 12,
							personnelCap: 80,
							ownerEmail: 'owner@example.com',
							isGifted: false,
							isSuspended: false,
							gift_expires_at: null,
							created_at: '2026-05-01T00:00:00.000Z',
							billingSnapshot: {
								source: 'stripe',
								subscriptionStatus: 'unpaid',
								driftDetected: true,
								syncStatus: 'needs_reconciliation',
								lastReconciledAt: '2026-05-23T00:00:00.000Z',
								reconciliationResult: 'repaired_drift:subscription_status'
							}
						}
					],
					pagination: {
						page: 1,
						pageSize: 25,
						totalCount: 1,
						totalPages: 1,
						q: ''
					},
					billingDiagnosticsError: false,
					planDiagnosticsError: false
				} as never
			}
		});

		expect(screen.getByText('Alpha Company')).toBeTruthy();
		expect(screen.getAllByText('Drifted').length).toBeGreaterThan(0);
		expect(screen.getByText(/Stripe \/ Unpaid/)).toBeTruthy();
		expect(screen.getByText(/Last checked/)).toBeTruthy();
		expect(screen.getByText('repaired_drift:subscription_status')).toBeTruthy();
	});

	it('shows effective policy usage diagnostics without raw billing payloads', () => {
		render(Page, {
			props: {
				data: {
					subscriptions: [
						{
							id: 'org-1',
							name: 'Alpha Company',
							effectiveTier: 'team',
							personnelCount: 12,
							personnelCap: 80,
							ownerEmail: 'owner@example.com',
							isGifted: false,
							isSuspended: false,
							gift_expires_at: null,
							created_at: '2026-05-01T00:00:00.000Z',
							planDiagnostics: {
								effectivePlan: {
									commercialPlan: 'team',
									tier: 'team',
									source: 'billing_snapshot',
									sourceLabel: 'Local billing snapshot',
									billingSource: 'stripe',
									giftTier: null,
									giftExpiresAt: null
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
										remediation: 'Upgrade for unlimited exports or wait until next month.',
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
									}
								]
							}
						}
					],
					pagination: {
						page: 1,
						pageSize: 25,
						totalCount: 1,
						totalPages: 1,
						q: ''
					},
					billingDiagnosticsError: false
				} as never
			}
		});

		expect(screen.getByText('Plan Usage')).toBeTruthy();
		expect(screen.getByText('Local billing snapshot')).toBeTruthy();
		expect(screen.getByText('Members')).toBeTruthy();
		expect(screen.getAllByText('11 / 10').length).toBeGreaterThan(0);
		expect(screen.getByText('Pending invitations')).toBeTruthy();
		expect(screen.getByText('1 / 10')).toBeTruthy();
		expect(screen.getByText('Monthly exports')).toBeTruthy();
		expect(screen.getByText('2 / Unlimited')).toBeTruthy();
		expect(screen.getByText('2 plan blockers')).toBeTruthy();
		expect(document.body.textContent).not.toContain('raw_payload');
		expect(document.body.textContent).not.toContain('sk_');
	});

	it('renders server-side pagination links with page size and search query params', () => {
		render(Page, {
			props: {
				data: {
					subscriptions: [
						{
							id: 'org-25',
							name: 'Alpha Company',
							effectiveTier: 'team',
							personnelCount: 12,
							personnelCap: 80,
							ownerEmail: 'owner@example.com',
							isGifted: false,
							isSuspended: false,
							gift_expires_at: null,
							created_at: '2026-05-01T00:00:00.000Z'
						}
					],
					pagination: {
						page: 1,
						pageSize: 25,
						totalCount: 50,
						totalPages: 2,
						q: 'Alpha',
						tier: 'team',
						status: 'drifted'
					},
					billingDiagnosticsError: false,
					planDiagnosticsError: false
				} as never
			}
		});

		expect(screen.getByText('Showing 1-25 of 50')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
			'/admin/subscriptions?page=2&pageSize=25&q=Alpha&tier=team&status=drifted'
		);
		expect(screen.getByText('Page 1 of 2')).toBeTruthy();
	});

	it('uses a matching empty state for successful bounded queries without rows', () => {
		render(Page, {
			props: {
				data: {
					subscriptions: [],
					pagination: {
						page: 1,
						pageSize: 25,
						totalCount: 0,
						totalPages: 1,
						q: 'Nope'
					},
					billingDiagnosticsError: false,
					planDiagnosticsError: false
				} as never
			}
		});

		expect(screen.getByText('No matching subscriptions.')).toBeTruthy();
	});
});
