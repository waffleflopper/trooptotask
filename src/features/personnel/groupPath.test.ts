import { describe, expect, it } from 'vitest';
import { buildGroupTree } from './groupTree';
import { NESTED_GROUPS } from '$lib/test-support/nestedGroups';
import { groupExportPath, resolveGroupPath } from './groupPath';

it.each([
	['platoon', '1st Platoon'],
	['squad', '1st Platoon / 2nd Squad'],
	['alpha', '1st Platoon / 2nd Squad / Alpha Team'],
	[null, ''],
	['missing', '']
])('writes the visible-root export path for %s', (id, expected) => {
	expect(groupExportPath(buildGroupTree(NESTED_GROUPS), id)).toBe(expected);
});

it('starts at a team leader’s visible root when its parent is hidden', () => {
	const tree = buildGroupTree(NESTED_GROUPS.filter((group) => group.id === 'alpha'));
	expect(groupExportPath(tree, 'alpha')).toBe('Alpha Team');
});

it('preserves a legacy whole name containing the path separator', () => {
	const tree = buildGroupTree([
		...NESTED_GROUPS,
		{ id: 'legacy', name: 'Clinic / Lab', sortOrder: 2, parentId: null, depth: 1 }
	]);
	expect(groupExportPath(tree, 'legacy')).toBe('Clinic / Lab');
});

describe('resolveGroupPath', () => {
	const twoAlphas = [
		...NESTED_GROUPS,
		{ id: 'other-alpha', name: 'Alpha Team', sortOrder: 0, parentId: 'other-squad', depth: 3 as const }
	];

	it.each([
		['2nd Squad', { kind: 'found', id: 'squad' }],
		['  bravo   team ', { kind: 'found', id: 'bravo' }],
		['1st Platoon / 2nd Squad / Alpha Team', { kind: 'found', id: 'alpha' }],
		['1st Platoon / 3rd Squad', { kind: 'found', id: 'other-squad' }],
		['2nd Squad / Alpha Team', { kind: 'missing' }],
		['1st Platoon / 9th Squad', { kind: 'missing' }],
		['Weapons', { kind: 'missing' }]
	])('reads %j against the whole tree', (text, expected) => {
		expect(resolveGroupPath(buildGroupTree(NESTED_GROUPS), text)).toEqual(expected);
	});

	it('asks for the path when a bare name answers to two Groups, and resolves the path', () => {
		const tree = buildGroupTree(twoAlphas);
		expect(resolveGroupPath(tree, 'Alpha Team')).toEqual({ kind: 'ambiguous', ids: ['alpha', 'other-alpha'] });
		expect(resolveGroupPath(tree, '1st Platoon / 3rd Squad / Alpha Team')).toEqual({
			kind: 'found',
			id: 'other-alpha'
		});
	});

	it('matches a legacy whole name containing the separator before splitting it', () => {
		const tree = buildGroupTree([
			...NESTED_GROUPS,
			{ id: 'legacy', name: 'Clinic / Lab', sortOrder: 2, parentId: null, depth: 1 },
			{ id: 'clinic', name: 'Clinic', sortOrder: 3, parentId: null, depth: 1 },
			{ id: 'lab', name: 'Lab', sortOrder: 0, parentId: 'clinic', depth: 2 }
		]);
		expect(resolveGroupPath(tree, 'Clinic / Lab')).toEqual({ kind: 'found', id: 'legacy' });
	});

	it('walks a team leader’s paths from the visible root only', () => {
		const tree = buildGroupTree(NESTED_GROUPS.filter((group) => ['alpha', 'bravo'].includes(group.id)));
		expect(resolveGroupPath(tree, 'Alpha Team')).toEqual({ kind: 'found', id: 'alpha' });
		expect(resolveGroupPath(tree, '1st Platoon / 2nd Squad / Alpha Team')).toEqual({ kind: 'missing' });
	});
});
