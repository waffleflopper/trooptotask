import { projectOrganizationAccessGrant } from './memberAccessProjection';
import { describe, expect, it } from 'vitest';
import { matchScopeSet, scopeSetResourceForGroupId } from './scopeSetAccess';

describe('Scope Set access', () => {
	it('treats ungrouped Personnel Records as organization-scoped resources', () => {
		expect(scopeSetResourceForGroupId(null)).toEqual({ kind: 'organization' });
		expect(scopeSetResourceForGroupId('')).toEqual({ kind: 'organization' });
		expect(scopeSetResourceForGroupId('group-a')).toEqual({ kind: 'group', groupId: 'group-a' });
	});

	it('denies group-scoped members access to ungrouped Personnel Records', () => {
		const match = matchScopeSet({ kind: 'groups', groupIds: ['group-a'] }, scopeSetResourceForGroupId(null));

		expect(match).toEqual({
			kind: 'out-of-scope',
			resource: { kind: 'organization' }
		});
	});

	it('allows matching whole-Group grants and denies other Groups', () => {
		expect(matchScopeSet({ kind: 'groups', groupIds: ['group-a'] }, { kind: 'group', groupId: 'group-a' })).toEqual({
			kind: 'group',
			groupId: 'group-a'
		});
		expect(matchScopeSet({ kind: 'groups', groupIds: ['group-a'] }, { kind: 'group', groupId: 'group-b' })).toEqual({
			kind: 'out-of-scope',
			resource: { kind: 'group', groupId: 'group-b' }
		});
	});

	it('keeps explicit unscoped resources outside Group Scope filtering', () => {
		expect(matchScopeSet({ kind: 'groups', groupIds: ['group-a'] }, { kind: 'unscoped' })).toEqual({
			kind: 'unscoped'
		});
	});
});

const groupId = (suffix: number) => `7a510000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

// The same platoon, squad, team, overlap, empty and deleted-grant rows as nested_group_scope.sql.
describe('SQL coverage parity', () => {
	it.each([
		{ label: 'Organization', roots: null, covered: [], allowed: [true, true, true, true, true, true] },
		{
			label: 'platoon',
			roots: [201],
			covered: [201, 202, 203, 204, 205],
			allowed: [true, true, true, true, true, false]
		},
		{ label: 'squad', roots: [202], covered: [202, 204, 205], allowed: [false, true, false, true, true, false] },
		{ label: 'team', roots: [204], covered: [204], allowed: [false, false, false, true, false, false] },
		{
			label: 'overlapping roots',
			roots: [202, 204],
			covered: [202, 204, 205],
			allowed: [false, true, false, true, true, false]
		},
		{ label: 'empty grant', roots: [], covered: [], allowed: [false, false, false, false, false, false] },
		{ label: 'deleted root', roots: [206], covered: [], allowed: [false, false, false, false, false, false] }
	])('$label admits exactly the SQL-covered resources', ({ roots, covered, allowed }) => {
		const grant = projectOrganizationAccessGrant(
			{
				role: 'member',
				member_preset: 'editor',
				access_scope_kind: roots === null ? 'organization' : 'groups',
				access_scope_group_ids: roots?.map(groupId) ?? [],
				covered_group_ids: covered.map(groupId)
			},
			'actor',
			'organization',
			{ disabledFeatures: [] }
		);
		expect(
			[201, 202, 203, 204, 205, null].map(
				(id) =>
					matchScopeSet(grant.scopeSet, scopeSetResourceForGroupId(id === null ? null : groupId(id))).kind !==
					'out-of-scope'
			)
		).toEqual(allowed);
	});

	it.each([undefined, null, ['valid', 42]])('refuses a request grant without valid SQL coverage %j', (coverage) => {
		expect(() =>
			projectOrganizationAccessGrant(
				{
					role: 'member',
					member_preset: 'viewer',
					access_scope_kind: 'groups',
					access_scope_group_ids: [groupId(202)],
					covered_group_ids: coverage
				},
				'actor',
				'organization',
				{ disabledFeatures: [] }
			)
		).toThrow();
	});
});
