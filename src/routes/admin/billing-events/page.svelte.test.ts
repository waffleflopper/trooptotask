// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';
import type { PageData } from './$types';

const originalClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	if (originalClipboardDescriptor) {
		Object.defineProperty(navigator, 'clipboard', originalClipboardDescriptor);
	} else {
		Reflect.deleteProperty(navigator, 'clipboard');
	}
});

const baseEvent = {
	id: 'evt_retryable_failed_123456789',
	type: 'checkout.session.completed',
	objectId: 'cs_123',
	secondaryDedupeKey: 'checkout.session.completed:cs_123',
	eventCreatedAt: '2026-05-23T00:00:00.000Z',
	processed: false,
	processedAt: null,
	processingState: 'retryable_failed',
	attemptCount: 2,
	lastError: 'temporary database timeout',
	processingResult: 'retryable processing failure',
	createdAt: '2026-05-23T00:00:01.000Z',
	updatedAt: '2026-05-23T00:00:02.000Z',
	canRetry: true,
	organization: { id: 'org-123456789', name: 'Alpha Company' }
} as const;

describe('admin billing events page', () => {
	it('shows safe event diagnostics and retry action for retryable failures', () => {
		render(Page, {
			props: {
				data: {
					events: [baseEvent],
					diagnosticsError: false
				} as never,
				form: null
			}
		});

		expect(screen.getByText('Billing Events')).toBeTruthy();
		expect(screen.getByText('checkout.session.completed')).toBeTruthy();
		expect(screen.getByText('Retryable Failed')).toBeTruthy();
		expect(screen.getByText('Alpha Company')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
	});

	it('does not show retry controls for processed events or raw payload content', () => {
		render(Page, {
			props: {
				data: {
					events: [
						{
							...baseEvent,
							id: 'evt_processed_123456789',
							processingState: 'processed',
							canRetry: false,
							lastError: null,
							processingResult: 'processed safely'
						}
					],
					diagnosticsError: false
				} as never,
				form: null
			}
		});

		expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
		expect(screen.getByText('Unavailable')).toBeTruthy();
		expect(screen.queryByText('not-for-admin-ui')).toBeNull();
	});

	it('shows a diagnostics warning when ledger diagnostics fail but billing health succeeds', () => {
		render(Page, {
			props: {
				data: {
					events: [],
					diagnosticsError: true,
					billingHealth: billingHealthData()
				} as never,
				form: null
			}
		});

		expect(screen.getByText('Some billing diagnostics could not be fully loaded.')).toBeTruthy();
		expect(screen.getByText(/billing events ledger and health summary cautiously/)).toBeTruthy();
	});

	it('shows a diagnostics warning when billing health summary is degraded', () => {
		render(Page, {
			props: {
				data: {
					events: [],
					diagnosticsError: false
				} as never,
				form: null
			}
		});

		expect(screen.getByText('Some billing diagnostics could not be fully loaded.')).toBeTruthy();
		expect(screen.getByText(/billing events ledger and health summary cautiously/)).toBeTruthy();
	});

	function billingHealthData(): NonNullable<PageData['billingHealth']> {
		return {
			generatedAt: '2026-06-24T12:00:00.000Z',
			overallState: 'needs_retry',
			states: ['needs_retry', 'payment_recovery_attention'],
			counts: {
				retryableFailures: 3,
				permanentFailures: 0,
				staleFailedEvents: 1,
				recentPaymentFailures: 1,
				driftedOrganizations: 0,
				staleReconciliation: 0,
				supportAttentionItems: 1
			},
			issues: [
				{
					id: 'event:evt_retry',
					primaryState: 'needs_retry',
					states: ['needs_retry'],
					severity: 'warning',
					title: 'Retryable webhook failure',
					detail: 'invoice.payment_failed is retryable_failed with 3 attempts.',
					organization: null,
					latestEventIds: ['evt_retry'],
					supportBundle: {
						organizationId: null,
						organizationName: null,
						stripeCustomerId: null,
						stripeSubscriptionId: null,
						stripeEventIds: ['evt_retry'],
						billingState: {
							source: null,
							commercialPlan: null,
							subscriptionStatus: null,
							collectionStatus: null,
							syncStatus: null,
							driftDetected: false
						},
						reconciliationResult: 'retryable processing failure',
						nextSteps: ['Use Retry event on Billing Events']
					}
				}
			],
			diagnosticsError: false
		};
	}

	it('shows wider billing health counts and a support-safe bundle', () => {
		render(Page, {
			props: {
				data: {
					events: [],
					diagnosticsError: false,
					billingHealth: billingHealthData()
				} as never,
				form: null
			}
		});

		expect(screen.getByText('Billing Health')).toBeTruthy();
		expect(screen.getByText('Retryable webhook failure')).toBeTruthy();
		expect(screen.getByText(/Use the action on each item/)).toBeTruthy();
		expect(screen.getByText('Next action')).toBeTruthy();
		expect(screen.getByText('Use Retry event on Billing Events')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Retry event for Retryable webhook failure evt_retry' })).toBeTruthy();
		expect(screen.getByText(/evt_retry/)).toBeTruthy();
		expect(screen.getByText('3')).toBeTruthy();
		expect(document.body.textContent).not.toContain('raw_payload');
		expect(document.body.textContent).not.toContain('sk_test_');
		expect(document.body.textContent).not.toContain('whsec_');
	});

	it('gives support bundle copy actions unique accessible names without changing the visible label', () => {
		const billingHealth = billingHealthData();
		const retryIssue = billingHealth.issues[0]!;
		billingHealth.issues = [
			{
				...retryIssue,
				organization: { id: 'org-alpha', name: 'Alpha Company' }
			},
			{
				...retryIssue,
				id: 'snapshot:org-bravo',
				primaryState: 'drift_detected',
				states: ['drift_detected'],
				title: 'Billing drift detected',
				organization: { id: 'org-bravo', name: 'Bravo Company' },
				latestEventIds: ['evt_drift'],
				supportBundle: {
					...retryIssue.supportBundle,
					organizationId: 'org-bravo',
					organizationName: 'Bravo Company',
					stripeEventIds: ['evt_drift'],
					nextSteps: ['Open org diagnostics and Refresh from Stripe']
				}
			}
		];

		render(Page, {
			props: {
				data: {
					events: [],
					diagnosticsError: false,
					billingHealth
				} as never,
				form: null
			}
		});

		expect(
			screen.getByRole('button', { name: 'Copy bundle for Retryable webhook failure (Alpha Company)' })
		).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Copy bundle for Billing drift detected (Bravo Company)' })).toBeTruthy();
		expect(
			screen.getByRole('button', { name: 'Retry event for Retryable webhook failure (Alpha Company) evt_retry' })
		).toBeTruthy();
		expect(
			screen
				.getByRole('link', {
					name: 'Open organization billing diagnostics for Retryable webhook failure (Alpha Company)'
				})
				.getAttribute('href')
		).toBe('/admin/organizations/org-alpha#billing-diagnostics');
		expect(
			screen
				.getByRole('link', {
					name: 'Open organization billing diagnostics for Billing drift detected (Bravo Company)'
				})
				.getAttribute('href')
		).toBe('/admin/organizations/org-bravo#billing-diagnostics');
		expect(screen.getAllByText('Copy bundle')).toHaveLength(2);
	});

	it('copies the support-safe billing health bundle text', async () => {
		const writeText = vi.fn(async (_text: string) => undefined);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText }
		});

		render(Page, {
			props: {
				data: {
					events: [],
					diagnosticsError: false,
					billingHealth: billingHealthData()
				} as never,
				form: null
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Copy bundle for Retryable webhook failure' }));

		expect(writeText).toHaveBeenCalledTimes(1);
		const copiedText = writeText.mock.calls[0]?.[0] ?? '';
		expect(copiedText).toContain('"stripeEventIds": [');
		expect(copiedText).toContain('"evt_retry"');
		expect(copiedText).toContain('"Use Retry event on Billing Events"');
		expect(copiedText).not.toContain('raw_payload');
		expect(copiedText).not.toContain('card');
		expect(copiedText).not.toContain('sk_test_');
		expect(copiedText).not.toContain('whsec_');
		expect(copiedText).not.toContain('webhook secret');
	});
});
