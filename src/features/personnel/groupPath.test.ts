import { expect, it } from 'vitest';
import { buildGroupTree } from './groupTree';
import { NESTED_GROUPS } from '$lib/test-support/nestedGroups';
import { groupExportPath } from './groupPath';

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
