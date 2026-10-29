import { describe, expect, it } from 'vitest';
import { BUILT_IN_RANK_CATALOG } from '$features/personnel/contracts';
import { poolOn, type PoolRules, type RosterPerson } from './rosterEngine';
import { person } from './rosterFixtures.test-support';

const RULES: PoolRules = { rank: null, mos: [], role: [], groupIds: [] };

function members(people: RosterPerson[], rules: Partial<PoolRules>, on = '2026-10-07') {
	return poolOn({
		rules: { ...RULES, ...rules },
		people,
		excusals: [],
		catalog: BUILT_IN_RANK_CATALOG,
		groups: [],
		on
	}).members.map((member) => member.id);
}

describe('pool rules', () => {
	const ranks = [
		person('SFC', 'Adams'),
		person('SSG', 'Baker'),
		person('SGT', 'Clark'),
		person('CPL', 'Dunn'),
		person('SPC', 'Evans')
	];

	it('take a rank range in catalog order, either end first', () => {
		expect(members(ranks, { rank: { from: 'SGT', to: 'SSG' } })).toEqual(['baker', 'clark']);
		expect(members(ranks, { rank: { from: 'SSG', to: 'SGT' } })).toEqual(['baker', 'clark']);
	});

	it('match MOS and Duty Role ignoring case, OR within a rule and AND across rules', () => {
		const people = [
			person('SGT', 'Adams', { states: [{ mos: '68W', clinicRole: 'Medic', groupId: 'alpha' }] }),
			person('SGT', 'Baker', { states: [{ mos: '68W', clinicRole: 'Medic', groupId: 'bravo' }] }),
			person('SGT', 'Clark', { states: [{ mos: '88M', clinicRole: 'medic', groupId: 'alpha' }] }),
			person('SGT', 'Dunn', { states: [{ mos: '92Y', clinicRole: 'Medic', groupId: 'alpha' }] })
		];

		expect(members(people, { mos: ['68w'] })).toEqual(['adams', 'baker']);
		expect(members(people, { mos: ['68w', '88m'] })).toEqual(['adams', 'baker', 'clark']);
		expect(members(people, { role: ['MEDIC'], groupIds: ['alpha'] })).toEqual(['adams', 'clark', 'dunn']);
		expect(members(people, { mos: ['68W', '88M'], groupIds: ['alpha'] })).toEqual(['adams', 'clark']);
	});

	it('leave out archived people and people not yet in the Organization', () => {
		const people = [
			person('SGT', 'Adams', { states: [{}, { from: '2026-10-05', active: false }] }),
			person('SGT', 'Baker', { joined: '2026-10-08' }),
			person('SGT', 'Clark')
		];

		expect(
			poolOn({
				groups: [],
				rules: null,
				people,
				excusals: [],
				catalog: BUILT_IN_RANK_CATALOG,
				on: '2026-10-07'
			}).members.map((member) => member.id)
		).toEqual(['clark']);
	});
});

describe('excusals', () => {
	it('remove a person only on the excused days', () => {
		const people = [person('SGT', 'Adams'), person('SGT', 'Baker')];
		const excusals = [{ personId: 'adams', reason: 'Profile', from: '2026-10-05', through: '2026-10-09' }];
		const on = (date: string) =>
			poolOn({ groups: [], rules: null, people, excusals, catalog: BUILT_IN_RANK_CATALOG, on: date });

		expect(on('2026-10-07').members.map((member) => member.id)).toEqual(['baker']);
		expect(on('2026-10-07').excused).toEqual(excusals);
		expect(on('2026-10-10').members.map((member) => member.id)).toEqual(['adams', 'baker']);
	});
});
