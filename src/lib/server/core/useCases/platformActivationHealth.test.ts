import { describe, expect, it, vi } from 'vitest';
import {
	createPlatformActivationHealth,
	mapActivationHealthSummary,
	type PlatformActivationOrganizationFacts
} from './platformActivationHealth';

function facts(
	counts: Partial<PlatformActivationOrganizationFacts['counts']> = {},
	organizationId = 'org-1'
): PlatformActivationOrganizationFacts {
	return {
		organizationId,
		organizationName: 'Able Company',
		organizationCreatedAt: '2026-06-01T12:00:00.000Z',
		counts: {
			activePersonnel: 5,
			members: 3,
			leaderMembers: 2,
			statusTypes: 4,
			assignmentTypes: 1,
			dutyRosterTemplates: 1,
			dutyRosterRuns: 0,
			dutyRosterHistory: 0,
			onboardingTemplateSteps: 2,
			trainingTypes: 0,
			ratingSchemeEntries: 0,
			...counts
		}
	};
}

const now = new Date('2026-09-19T12:00:00.000Z');

function summarize(rows: PlatformActivationOrganizationFacts[]) {
	return mapActivationHealthSummary({ facts: rows, now });
}

describe('noncommercial activation health', () => {
	it('activates an Organization with a meaningful roster, another accepted leader, Duty Roster activity and setup', () => {
		const summary = summarize([facts()]);
		expect(summary).toMatchObject({
			generatedAt: now.toISOString(),
			overallState: 'activated',
			diagnosticsError: false,
			counts: {
				candidateOrganizations: 1,
				activatedOrganizations: 1,
				inProgressOrganizations: 0,
				meaningfulRosters: 1,
				acceptedLeaders: 1,
				dutyRosterStarted: 1,
				setupStarted: 1
			}
		});
		expect(summary.organizations[0]).toMatchObject({
			organization: { id: 'org-1', name: 'Able Company' },
			state: 'activated',
			score: 100,
			nextSteps: [],
			supportBundle: { activation: { activePersonnel: 5, members: 3, meaningfulRosterThreshold: 5 } }
		});
	});

	it('does not count ordinary members, inferred account facts or seeded defaults as product activation', () => {
		const summary = summarize([
			facts({
				activePersonnel: 4,
				members: 12,
				leaderMembers: 1,
				dutyRosterTemplates: 0,
				onboardingTemplateSteps: 0
			})
		]);
		expect(summary).toMatchObject({
			overallState: 'in_progress',
			counts: { activatedOrganizations: 0, inProgressOrganizations: 1, meaningfulRosters: 0, acceptedLeaders: 0 }
		});
		expect(summary.organizations[0]).toMatchObject({ state: 'in_progress', score: 0 });
		expect(summary.organizations[0].nextSteps).toHaveLength(4);
		expect(summary.organizations[0].milestones).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ id: 'meaningful_roster', state: 'incomplete' }),
				expect.objectContaining({ id: 'leader_accepted', state: 'incomplete' }),
				expect.objectContaining({ id: 'defaults_present', state: 'deferred' })
			])
		);
	});

	it.each([
		{ dutyRosterRuns: 1, trainingTypes: 1 },
		{ dutyRosterHistory: 1, ratingSchemeEntries: 1 }
	])('retains alternative Duty Roster and setup records as activation signals: %j', (counts) => {
		const summary = summarize([facts({ dutyRosterTemplates: 0, onboardingTemplateSteps: 0, ...counts })]);
		expect(summary.organizations[0]).toMatchObject({ state: 'activated', score: 100 });
	});

	it('scores partial product progress independently of Organization timestamp and defaults', () => {
		const row = facts({ leaderMembers: 1, statusTypes: 0, assignmentTypes: 0, onboardingTemplateSteps: 0 });
		row.organizationCreatedAt = null;
		expect(summarize([row]).organizations[0]).toMatchObject({ state: 'in_progress', score: 50 });
	});

	it('summarizes every selected Organization while showing the least-complete 12 first', () => {
		const summary = summarize([
			...Array.from({ length: 13 }, (_, index) => facts({}, `activated-${index}`)),
			facts({ activePersonnel: 0 }, 'partial'),
			facts({ activePersonnel: 0, leaderMembers: 1 }, 'least-complete')
		]);
		expect(summary.counts).toMatchObject({
			candidateOrganizations: 15,
			activatedOrganizations: 13,
			inProgressOrganizations: 2
		});
		expect(summary.organizations).toHaveLength(12);
		expect(summary.organizations.slice(0, 2).map((row) => row.id)).toEqual(['least-complete', 'partial']);
	});

	it('distinguishes an empty successful scan from unavailable diagnostics', async () => {
		expect(summarize([])).toMatchObject({ overallState: 'no_candidates', diagnosticsError: false, organizations: [] });
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const health = createPlatformActivationHealth({
				store: {
					listActivationOrganizationFacts: async () => {
						throw new Error('Provider denied');
					}
				}
			});
			expect(await health.summarize({ now })).toMatchObject({
				generatedAt: now.toISOString(),
				overallState: 'diagnostics_unavailable',
				diagnosticsError: true,
				organizations: [],
				counts: { candidateOrganizations: 0, activatedOrganizations: 0, inProgressOrganizations: 0 }
			});
		} finally {
			errorSpy.mockRestore();
		}
	});
});
