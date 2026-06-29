// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

function renderOrganizationsPage(data: Record<string, unknown>) {
	return render(Page, {
		props: {
			data: {
				organizations: [],
				pagination: {
					page: 1,
					pageSize: 25,
					totalCount: 0,
					totalPages: 1,
					q: ''
				},
				activationHealth: {
					generatedAt: '2026-06-28T12:00:00.000Z',
					overallState: 'no_candidates',
					candidateLimit: 100,
					counts: {
						candidateOrganizations: 0,
						activatedOrganizations: 0,
						checkoutStarted: 0,
						checkoutCompleted: 0,
						meaningfulRosters: 0,
						acceptedLeaders: 0,
						dutyRosterStarted: 0,
						setupStarted: 0,
						paidBelowRosterThreshold: 0,
						supportAttentionItems: 0
					},
					organizations: [],
					diagnosticsError: false
				},
				...data
			} as never
		}
	});
}

describe('admin organizations page', () => {
	it('renders support-safe activation health without checkout URLs or personal analytics details', () => {
		const sensitiveSentinels = [
			'https://checkout.test/sentinel-checkout-url',
			'cs_test_sensitive_checkout_session',
			'203.0.113.44',
			'va_sensitive_analytics_identifier',
			'sk_test_sensitive_secret'
		];

		renderOrganizationsPage({
			organizations: [
				{
					id: 'org-1',
					name: 'Able Company',
					effectiveTier: 'team',
					memberCount: 1,
					personnelCount: 2,
					ownerEmail: 'owner@example.com',
					isSuspended: false,
					created_at: '2026-06-01T00:00:00.000Z'
				}
			],
			pagination: {
				page: 1,
				pageSize: 25,
				totalCount: 1,
				totalPages: 1,
				q: ''
			},
			activationHealth: {
				generatedAt: '2026-06-28T12:00:00.000Z',
				overallState: 'needs_attention',
				candidateLimit: 100,
				counts: {
					candidateOrganizations: 3,
					activatedOrganizations: 0,
					checkoutStarted: 1,
					checkoutCompleted: 1,
					meaningfulRosters: 0,
					acceptedLeaders: 0,
					dutyRosterStarted: 1,
					setupStarted: 1,
					paidBelowRosterThreshold: 1,
					supportAttentionItems: 1
				},
				organizations: [
					{
						id: 'org-1',
						organization: { id: 'org-1', name: 'Able Company' },
						state: 'needs_attention',
						score: 70,
						milestones: [],
						nextSteps: ['Import or add at least 5 active personnel.'],
						supportBundle: {
							organizationId: 'org-1',
							organizationName: 'Able Company',
							acquisition: {
								organizationCreatedAt: '2026-06-01T00:00:00.000Z',
								checkoutStarted: true,
								checkoutCompleted: true,
								checkoutRecovered: false,
								latestCheckoutStatus: 'completed',
								billingState: {
									source: 'stripe',
									commercialPlan: 'team',
									subscriptionStatus: 'active',
									collectionStatus: 'current',
									syncStatus: 'synced'
								},
								checkoutUrl: sensitiveSentinels[0],
								stripeCheckoutSessionId: sensitiveSentinels[1],
								rawIpAddress: sensitiveSentinels[2],
								analyticsIdentifier: sensitiveSentinels[3],
								secretKey: sensitiveSentinels[4]
							},
							activation: {
								activePersonnel: 2,
								members: 1,
								statusTypes: 4,
								assignmentTypes: 1,
								dutyRosterTemplates: 1,
								dutyRosterRuns: 1,
								dutyRosterHistory: 0,
								onboardingTemplateSteps: 2,
								trainingTypes: 3,
								ratingSchemeEntries: 1,
								meaningfulRosterThreshold: 5
							},
							nextSteps: ['Import or add at least 5 active personnel.']
						}
					}
				],
				diagnosticsError: false
			}
		});

		expect(screen.getByText('Acquisition and Activation Health')).toBeTruthy();
		expect(screen.getAllByText('Needs Attention').length).toBeGreaterThan(0);
		expect(document.body.textContent).toContain('self-service or paid candidates');
		expect(document.body.textContent).toContain('0 activated');
		expect(document.body.textContent).toContain('Counts cover up to 100 launch candidates.');
		expect(screen.getByText('Showing top 1 of 3 candidates.')).toBeTruthy();
		expect(screen.getByText('2 / 5')).toBeTruthy();
		expect(screen.getByText('1 templates / 1 runs')).toBeTruthy();
		expect(screen.getByText('2 onboarding / 3 training / 1 evals')).toBeTruthy();
		expect(screen.getByText('Import or add at least 5 active personnel.')).toBeTruthy();
		expect(screen.getAllByRole('link', { name: 'Able Company' }).map((link) => link.getAttribute('href'))).toEqual([
			'/admin/organizations/org-1',
			'/admin/organizations/org-1'
		]);
		expect(document.body.textContent).not.toContain('checkout_url');
		expect(document.body.textContent).not.toContain('stripe_checkout_session_id');
		expect(document.body.textContent).not.toContain('raw IP');
		expect(document.body.textContent).not.toContain('analytics identifier');
		expect(document.body.textContent).not.toContain('sk_test_');
		for (const sentinel of sensitiveSentinels) {
			expect(document.body.textContent).not.toContain(sentinel);
		}
	});

	it('warns when activation health diagnostics are unavailable', () => {
		renderOrganizationsPage({
			activationHealth: {
				generatedAt: '2026-06-28T12:00:00.000Z',
				overallState: 'diagnostics_unavailable',
				candidateLimit: 100,
				counts: {
					candidateOrganizations: 0,
					activatedOrganizations: 0,
					checkoutStarted: 0,
					checkoutCompleted: 0,
					meaningfulRosters: 0,
					acceptedLeaders: 0,
					dutyRosterStarted: 0,
					setupStarted: 0,
					paidBelowRosterThreshold: 0,
					supportAttentionItems: 0
				},
				organizations: [],
				diagnosticsError: true
			}
		});

		expect(screen.getByText('Activation health diagnostics could not be fully loaded.')).toBeTruthy();
		expect(screen.getByText(/Checkout, roster, member, Duty Roster, and setup counts may be incomplete/)).toBeTruthy();
	});
});
