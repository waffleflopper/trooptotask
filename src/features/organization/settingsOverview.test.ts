import { describe, expect, it } from 'vitest';
import { OVERVIEW_CHECKS, summarizeOverview, type OverviewSources } from './settingsOverview';

describe('summarizeOverview', () => {
	it('waits for every check to settle, whatever the settled ones say', () => {
		expect(summarizeOverview([{ count: 3 }, 'pending', 'failed'])).toEqual({ kind: 'checking' });
	});

	it('is all set only when every check settled at zero', () => {
		expect(summarizeOverview([{ count: 0 }, { count: 0 }])).toEqual({ kind: 'allSet' });
	});

	it('counts the checks with something outstanding, not the items in them', () => {
		expect(summarizeOverview([{ count: 40 }, { count: 0 }, { count: 1 }])).toEqual({ kind: 'attention', checks: 2 });
	});

	it('still reports what is outstanding when another check failed', () => {
		expect(summarizeOverview([{ count: 2 }, 'failed'])).toEqual({ kind: 'attention', checks: 1 });
	});

	it('says it is incomplete rather than all set when a check failed and nothing else is outstanding', () => {
		expect(summarizeOverview([{ count: 0 }, 'failed'])).toEqual({ kind: 'incomplete' });
	});
});

describe('overview checks', () => {
	const sources: OverviewSources = {
		pendingApprovals: Promise.resolve(4),
		invitationsToFollowUp: Promise.resolve({ deliveryFailed: 2, expiringSoon: 3 }),
		membersCoveringNoGroups: Promise.resolve(1),
		ungroupedPeople: Promise.resolve(6),
		featuresNotSetUp: Promise.resolve(['evaluations'])
	};

	it('reads each check into a count, in the order the Overview lists them', async () => {
		const read = await Promise.all(
			OVERVIEW_CHECKS.map(async (check) => [check.key, (await check.read(sources)).count])
		);

		expect(read).toEqual([
			['approvals', 4],
			['invitations', 5],
			['memberScopes', 1],
			['ungrouped', 6],
			['features', 1]
		]);
	});

	it('splits invitations into failed and expiring soon, and gives a feature its own fix', async () => {
		const [invitations, features] = [OVERVIEW_CHECKS[1], OVERVIEW_CHECKS[4]];

		expect((await invitations.read(sources)).breakdown).toBe('2 failed · 3 expiring soon');
		expect((await features.read(sources)).items).toEqual([
			{ text: 'Evaluations: no rating scheme', fix: { label: 'Add an entry', path: 'evals' } }
		]);
	});
});
