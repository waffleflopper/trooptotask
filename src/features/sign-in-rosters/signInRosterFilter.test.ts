import { describe, expect, it } from 'vitest';
import type { RankCatalogEntry } from '$features/personnel/contracts';
import {
	emptySignInRosterFilter,
	filterSignInRosterPersonnel,
	matchesSignInRosterFilter,
	signInRosterFilterOptions,
	signInRosterRankCategoryGroups,
	type SignInRosterFilter,
	type SignInRosterFilterPerson
} from './signInRosterFilter';

const personnel = [
	{ id: 'alpha-medic', groupId: 'alpha', rank: 'SGT', mos: '68W', clinicRole: 'Medic' },
	{ id: 'bravo-driver', groupId: 'bravo', rank: 'SSG', mos: '68C', clinicRole: 'Driver' },
	{ id: 'other-group', groupId: 'charlie', rank: 'SGT', mos: '68W', clinicRole: 'Medic' },
	{ id: 'other-rank', groupId: 'alpha', rank: 'CPT', mos: '68W', clinicRole: 'Medic' },
	{ id: 'other-mos', groupId: 'alpha', rank: 'SGT', mos: '11B', clinicRole: 'Medic' },
	{ id: 'other-role', groupId: 'alpha', rank: 'SGT', mos: '68W', clinicRole: 'Cook' }
];

describe('Sign-in roster audience filters', () => {
	it('requires every selected dimension and accepts either selected value within each dimension', () => {
		const filter: SignInRosterFilter = {
			groups: ['alpha', 'bravo'],
			ranks: ['SGT', 'SSG'],
			mos: ['68W', '68C'],
			roles: ['Medic', 'Driver']
		};

		expect(filterSignInRosterPersonnel(personnel, filter).map((person) => person.id)).toEqual([
			'alpha-medic',
			'bravo-driver'
		]);
	});

	it('leaves the audience unrestricted when every dimension is empty', () => {
		expect(filterSignInRosterPersonnel(personnel, emptySignInRosterFilter()).map((person) => person.id)).toEqual([
			'alpha-medic',
			'bravo-driver',
			'other-group',
			'other-rank',
			'other-mos',
			'other-role'
		]);
	});

	it.each<{ filter: SignInRosterFilter; expected: string[] }>([
		{ filter: { groups: ['bravo'], ranks: [], mos: [], roles: [] }, expected: ['bravo-driver'] },
		{ filter: { groups: [], ranks: ['CPT'], mos: [], roles: [] }, expected: ['other-rank'] },
		{ filter: { groups: [], ranks: [], mos: ['11B'], roles: [] }, expected: ['other-mos'] },
		{ filter: { groups: [], ranks: [], mos: [], roles: ['Cook'] }, expected: ['other-role'] }
	])('applies a single dimension with the other dimensions empty, $filter', ({ filter, expected }) => {
		expect(filterSignInRosterPersonnel(personnel, filter).map((person) => person.id)).toEqual(expected);
	});

	it.each<SignInRosterFilter>([
		{ groups: ['alpha'], ranks: [], mos: [], roles: [] },
		{ groups: [], ranks: [], mos: ['68W'], roles: [] },
		{ groups: [], ranks: [], mos: [], roles: ['Medic'] }
	])('requires a value for a selected dimension while allowing nulls in an unrestricted audience, %j', (filter) => {
		const person: SignInRosterFilterPerson = { groupId: null, rank: 'SGT', mos: null, clinicRole: null };

		expect(matchesSignInRosterFilter(person, emptySignInRosterFilter())).toBe(true);
		expect(matchesSignInRosterFilter(person, filter)).toBe(false);
	});

	it('matches a stored rank with surrounding spaces to the rank it is offered as', () => {
		const person: SignInRosterFilterPerson = { groupId: 'alpha', rank: ' SGT ', mos: '68W', clinicRole: 'Medic' };

		expect(matchesSignInRosterFilter(person, { groups: [], ranks: ['SGT'], mos: [], roles: [] })).toBe(true);
	});

	it('matches group ids independently of group labels', () => {
		const person = { ...personnel[0], groupName: 'bravo' };

		expect(matchesSignInRosterFilter(person, { groups: ['alpha'], ranks: [], mos: [], roles: [] })).toBe(true);
		expect(matchesSignInRosterFilter(person, { groups: ['bravo'], ranks: [], mos: [], roles: [] })).toBe(false);
	});

	it('creates independent empty drafts', () => {
		const first = emptySignInRosterFilter();
		first.mos.push('68W');

		expect(first).toEqual({ groups: [], ranks: [], mos: ['68W'], roles: [] });
		expect(emptySignInRosterFilter()).toEqual({ groups: [], ranks: [], mos: [], roles: [] });
	});
});

describe('signInRosterFilterOptions', () => {
	it('returns sorted distinct nonempty MOS and Duty Roles from active personnel only', () => {
		expect(
			signInRosterFilterOptions([
				{ mos: '68W', clinicRole: 'Medic', archivedAt: null },
				{ mos: '68C', clinicRole: 'Driver' },
				{ mos: '68W', clinicRole: 'Medic' },
				{ mos: '', clinicRole: '' },
				{ mos: null, clinicRole: null },
				{ mos: '  ', clinicRole: '\t' },
				{ mos: '11B', clinicRole: 'Cook', archivedAt: '2026-05-01T00:00:00Z' }
			])
		).toEqual({ mos: ['68C', '68W'], roles: ['Driver', 'Medic'] });
	});
});

describe('signInRosterRankCategoryGroups', () => {
	it.each([undefined, []])('uses built-in rank categories when the Organization catalog is %j', (catalog) => {
		expect(signInRosterRankCategoryGroups(catalog, ['CPT', 'CW2', 'SGT', 'sgt', 'CIV', 'LOCAL'])).toEqual({
			officer: ['CPT'],
			warrant: ['CW2'],
			enlisted: ['SGT', 'sgt'],
			civilian: ['CIV']
		});
	});

	it('uses Organization categories for active and retired ranks, with unambiguous case aliases', () => {
		const catalog = [
			rankEntry('PO2', 'enlisted'),
			rankEntry('SP4', 'enlisted', 'retired'),
			rankEntry('ADM', 'officer'),
			rankEntry('CWO3', 'warrant'),
			rankEntry('CIV', 'civilian'),
			rankEntry('LOCAL', 'custom'),
			rankEntry('Mixed', 'officer'),
			rankEntry('MIXED', 'enlisted')
		];

		expect(
			signInRosterRankCategoryGroups(catalog, [
				'po2',
				'SP4',
				'ADM',
				'CWO3',
				'CIV',
				'LOCAL',
				'SGT',
				'Mixed',
				'MIXED',
				'mixed'
			])
		).toEqual({
			officer: ['ADM', 'Mixed'],
			warrant: ['CWO3'],
			enlisted: ['po2', 'SP4', 'MIXED'],
			civilian: ['CIV']
		});
	});
});

function rankEntry(
	code: string,
	category: RankCatalogEntry['category'],
	state: RankCatalogEntry['state'] = 'active'
): RankCatalogEntry {
	return {
		code,
		label: code,
		category,
		service: 'custom',
		payGrade: 'ungraded',
		state,
		sortOrder: 0
	};
}
