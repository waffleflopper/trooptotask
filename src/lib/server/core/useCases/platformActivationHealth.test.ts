import { describe, expect, it, vi } from 'vitest';
import {
	MEANINGFUL_ROSTER_THRESHOLD,
	createPlatformActivationHealth,
	mapActivationHealthSummary,
	type PlatformActivationOrganizationFacts
} from './platformActivationHealth';

function facts(overrides: Partial<PlatformActivationOrganizationFacts> = {}): PlatformActivationOrganizationFacts {
	return {
		organizationId: 'org-1',
		organizationName: 'Able Company',
		organizationCreatedAt: '2026-06-01T12:00:00.000Z',
		billing: {
			source: 'stripe',
			commercialPlan: 'team',
			subscriptionStatus: 'active',
			collectionStatus: 'current',
			syncStatus: 'synced'
		},
		...overrides,
		checkout: {
			attemptCount: 1,
			completedCount: 1,
			interruptedCount: 0,
			inProgressCount: 0,
			latestStatus: 'completed',
			latestAt: '2026-06-01T12:15:00.000Z',
			...overrides.checkout
		},
		counts: {
			activePersonnel: MEANINGFUL_ROSTER_THRESHOLD,
			members: 2,
			statusTypes: 4,
			assignmentTypes: 1,
			dutyRosterTemplates: 1,
			dutyRosterRuns: 1,
			dutyRosterHistory: 0,
			onboardingTemplateSteps: 2,
			trainingTypes: 3,
			ratingSchemeEntries: 1,
			...overrides.counts
		}
	};
}

describe('mapActivationHealthSummary', () => {
	it('marks an activated paid customer when existing Organization-level milestones are complete', () => {
		const summary = mapActivationHealthSummary({
			facts: [facts()],
			now: new Date('2026-06-28T12:00:00.000Z')
		});

		expect(summary).toMatchObject({
			generatedAt: '2026-06-28T12:00:00.000Z',
			overallState: 'activated',
			diagnosticsError: false,
			counts: {
				candidateOrganizations: 1,
				activatedOrganizations: 1,
				checkoutStarted: 1,
				checkoutCompleted: 1,
				meaningfulRosters: 1,
				acceptedLeaders: 1,
				dutyRosterStarted: 1,
				setupStarted: 1,
				paidBelowRosterThreshold: 0,
				supportAttentionItems: 0
			}
		});
		expect(summary.organizations[0]).toMatchObject({
			organization: { id: 'org-1', name: 'Able Company' },
			state: 'activated',
			score: 100,
			nextSteps: []
		});
		expect(summary.organizations[0]?.supportBundle).toMatchObject({
			organizationId: 'org-1',
			activation: {
				activePersonnel: MEANINGFUL_ROSTER_THRESHOLD,
				meaningfulRosterThreshold: MEANINGFUL_ROSTER_THRESHOLD
			}
		});
	});

	it('surfaces a paid-but-empty Organization without pretending imports or defaults were reviewed', () => {
		const summary = mapActivationHealthSummary({
			facts: [
				facts({
					organizationId: 'org-empty',
					organizationName: 'Empty Company',
					counts: {
						activePersonnel: 0,
						members: 1,
						statusTypes: 4,
						assignmentTypes: 1,
						dutyRosterTemplates: 0,
						dutyRosterRuns: 0,
						dutyRosterHistory: 0,
						onboardingTemplateSteps: 0,
						trainingTypes: 0,
						ratingSchemeEntries: 0
					}
				})
			],
			now: new Date('2026-06-28T12:00:00.000Z')
		});

		expect(summary.overallState).toBe('needs_attention');
		expect(summary.counts).toMatchObject({
			candidateOrganizations: 1,
			activatedOrganizations: 0,
			checkoutCompleted: 1,
			meaningfulRosters: 0,
			acceptedLeaders: 0,
			paidBelowRosterThreshold: 1,
			supportAttentionItems: 1
		});
		expect(summary.organizations[0]).toMatchObject({
			organization: { id: 'org-empty', name: 'Empty Company' },
			state: 'needs_attention',
			nextSteps: [
				`Import or add at least ${MEANINGFUL_ROSTER_THRESHOLD} active personnel.`,
				'Invite another leader and confirm the Organization Membership is accepted.',
				'Create the first Duty Roster template or accepted run.',
				'Start onboarding, training, or eval setup with existing configuration records.'
			]
		});
		expect(summary.organizations[0]?.milestones).toContainEqual(
			expect.objectContaining({
				id: 'defaults_present',
				state: 'deferred',
				detail: expect.stringContaining('Reviewed-state persistence is deferred')
			})
		);
		expect(JSON.stringify(summary.organizations[0]?.supportBundle)).not.toContain('checkout_url');
		expect(JSON.stringify(summary.organizations[0]?.supportBundle)).not.toContain('stripe_checkout_session_id');
	});
});

describe('createPlatformActivationHealth', () => {
	it('returns diagnostics-unavailable state when the activation store fails', async () => {
		const store = {
			listActivationOrganizationFacts: vi.fn(async () => {
				throw new Error('database offline');
			})
		};
		vi.spyOn(console, 'error').mockImplementation(() => undefined);

		const summary = await createPlatformActivationHealth({ store }).summarize({
			now: new Date('2026-06-28T12:00:00.000Z')
		});

		expect(summary).toMatchObject({
			generatedAt: '2026-06-28T12:00:00.000Z',
			overallState: 'diagnostics_unavailable',
			diagnosticsError: true,
			counts: {
				candidateOrganizations: 0,
				supportAttentionItems: 0
			},
			organizations: []
		});
		expect(console.error).toHaveBeenCalledWith('Admin activation health query failed:', expect.any(Error));
	});
});
