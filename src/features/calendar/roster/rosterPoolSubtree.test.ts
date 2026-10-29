import { expect, it } from 'vitest';
import { BUILT_IN_RANK_CATALOG } from '$features/personnel/contracts';
import { NESTED_GROUPS } from '$lib/test-support/nestedGroups';
import { poolOn, simulateRoster, type PoolRules } from './rosterEngine';
import { person, rosterFacts } from './rosterFixtures.test-support';

it.each([
	[['platoon'], ['alpha', 'bravo', 'hq', 'platoon-hq']],
	[['alpha'], ['alpha']],
	[
		['alpha', 'bravo'],
		['alpha', 'bravo']
	]
])('uses the same subtree membership for Pool preview and roster simulation with %j', (groupIds, expected) => {
	const people = [
		person('SGT', 'Alpha', { states: [{ groupId: 'alpha' }] }),
		person('SGT', 'Bravo', { states: [{ groupId: 'bravo' }] }),
		person('SGT', 'HQ', { states: [{ groupId: 'squad' }] }),
		person('SGT', 'Platoon-HQ', { states: [{ groupId: 'platoon' }] }),
		person('SGT', 'Outside', { states: [{ groupId: 'other-platoon' }] }),
		person('SGT', 'Unassigned')
	];
	const rules: PoolRules = { rank: null, mos: [], role: [], groupIds };
	const preview = poolOn({
		rules,
		people,
		groups: NESTED_GROUPS,
		catalog: BUILT_IN_RANK_CATALOG,
		excusals: [],
		on: '2026-10-01'
	});
	const run = simulateRoster(
		rosterFacts({
			people,
			groups: NESTED_GROUPS,
			window: { from: '2026-10-01', through: '2026-10-01' },
			form: { rules: { pool: rules, weekendMode: 'same' } }
		})
	);
	expect(preview.members.map((member) => member.id)).toEqual(expected);
	expect(run.days[0].standing.map((standing) => standing.personId).sort()).toEqual(expected);
});
