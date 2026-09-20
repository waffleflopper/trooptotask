// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { ComponentProps } from 'svelte';
import { cleanup, render, screen } from '@testing-library/svelte';

import Page from './+page.svelte';

type PageProps = ComponentProps<typeof Page>;

afterEach(() => {
	cleanup();
});

function renderOrganizationsPage(data: Partial<PageProps['data']>) {
	const baseData: PageProps['data'] = {
		session: null,
		adminUserId: 'admin-1',
		adminEmail: 'admin@example.test',
		adminRole: 'support',
		accessiblePages: ['dashboard', 'users', 'organizations'],
		visibleNavGroups: [
			{
				label: null,
				items: [{ label: 'Dashboard', href: '/admin', page: 'dashboard' }]
			}
		],
		organizations: [],
		pagination: {
			page: 1,
			pageSize: 25,
			totalCount: 0,
			totalPages: 1,
			q: '',
			status: 'all'
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
		}
	};

	return render(Page, {
		props: {
			data: {
				...baseData,
				...data
			}
		}
	});
}

describe('admin organizations page', () => {
	it('renders support-safe activation health without checkout URLs or personal analytics details', () => {
		renderOrganizationsPage({
			organizations: [
				{
					id: 'org-1',
					name: 'Able Company',
					memberCount: 1,
					personnelCount: 2,
					ownerEmail: 'owner@example.com',
					isSuspended: false,
					suspended_at: null,
					created_at: '2026-06-01T00:00:00.000Z'
				}
			],
			pagination: {
				page: 1,
				pageSize: 25,
				totalCount: 1,
				totalPages: 1,
				q: '',
				status: 'all'
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
								}
							},
							activation: {
								activePersonnel: 2,
								members: 1,
								leaderMembers: 1,
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
	});

	it('keeps search, page size and suspension status when navigating the Organization index', () => {
		renderOrganizationsPage({
			pagination: { page: 2, pageSize: 25, totalCount: 60, totalPages: 3, q: 'Able & Baker', status: 'suspended' }
		});
		expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveProperty('value', 'Able & Baker');
		expect(screen.getByRole('combobox', { name: 'Status' })).toHaveProperty('value', 'suspended');
		expect(screen.getByRole('combobox', { name: 'Rows' })).toHaveProperty('value', '25');
		expect(screen.getByRole('link', { name: 'Previous' }).getAttribute('href')).toBe(
			'/admin/organizations?page=1&pageSize=25&q=Able+%26+Baker&status=suspended'
		);
		expect(screen.getByRole('link', { name: 'Next' }).getAttribute('href')).toBe(
			'/admin/organizations?page=3&pageSize=25&q=Able+%26+Baker&status=suspended'
		);
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

		expect(screen.getAllByText('Activation health diagnostics could not be fully loaded.')).toHaveLength(2);
		expect(screen.getByText(/Checkout, roster, member, Duty Roster, and setup counts may be incomplete/)).toBeTruthy();
		expect(screen.getByText('Unavailable')).toBeTruthy();
		expect(screen.getByText('Activation health data is unavailable until diagnostics load successfully.')).toBeTruthy();
		expect(
			screen.getByText('Activation health diagnostics are unavailable. Retry after the health scan succeeds.')
		).toBeTruthy();
		expect(document.body.textContent).not.toContain('No self-service or paid activation health candidates found.');
		expect(document.body.textContent).not.toContain('0 self-service or paid candidates');
	});
});
