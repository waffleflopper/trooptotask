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
					]
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
					billingDiagnosticsError: true
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
								driftDetected: true,
								syncStatus: 'needs_reconciliation',
								lastReconciledAt: '2026-05-23T00:00:00.000Z',
								reconciliationResult: 'repaired_drift:subscription_status'
							}
						}
					]
				} as never
			}
		});

		expect(screen.getByText('Alpha Company')).toBeTruthy();
		expect(screen.getAllByText('Drifted').length).toBeGreaterThan(0);
		expect(screen.getByText(/Last checked/)).toBeTruthy();
		expect(screen.getByText('repaired_drift:subscription_status')).toBeTruthy();
	});
});
