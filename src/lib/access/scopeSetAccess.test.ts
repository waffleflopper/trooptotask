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
