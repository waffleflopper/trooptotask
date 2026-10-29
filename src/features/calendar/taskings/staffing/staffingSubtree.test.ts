import { expect, it } from 'vitest';
import { buildGroupTree } from '$features/personnel/contracts';
import { NESTED_GROUPS } from '$lib/test-support/nestedGroups';
import { isCandidateFor, pickReview, type TaskingPick } from './staffingModel';

const tree = buildGroupTree(NESTED_GROUPS);

// Candidacy cases exercised by supabase/tests/nested_group_scope.sql.
it.each([
	['squad HQ', 'squad', 'squad', true],
	['Alpha Team', 'squad', 'alpha', true],
	['Bravo Team', 'squad', 'bravo', true],
	['platoon HQ', 'squad', 'platoon', false],
	['neighboring squad', 'squad', 'other-squad', false],
	['Unassigned', 'squad', null, false],
	['descendant of platoon', 'platoon', 'alpha', true],
	['other platoon', 'platoon', 'other-platoon', false],
	['Organization Unassigned', null, null, true],
	['Organization team', null, 'alpha', true]
] as const)('matches SQL candidacy for %s', (_name, responsible, groupId, expected) => {
	expect(
		isCandidateFor(responsible ? { kind: 'group', groupId: responsible } : { kind: 'organization' }, { groupId }, tree)
	).toBe(expected);
});

it('keeps review pending after a team leaves and returns to the responsible subtree', () => {
	const pick: TaskingPick = {
		personnelId: 'person',
		rank: 'SPC',
		firstName: 'Pat',
		lastName: 'Lee',
		groupId: 'alpha',
		mos: '',
		clinicRole: '',
		archived: false,
		selectedAt: '2026-10-01',
		reviewSince: '2026-10-02'
	};
	const moved = buildGroupTree(
		NESTED_GROUPS.map((group) => (group.id === 'alpha' ? { ...group, parentId: 'other-squad' } : group))
	);
	expect(pickReview(pick, { kind: 'group', groupId: 'squad' }, moved)).toBe('left_group');
	expect(pickReview(pick, { kind: 'group', groupId: 'squad' }, tree)).toBe('eligible_again');
	expect(pickReview({ ...pick, groupId: 'bravo' }, { kind: 'group', groupId: 'squad' }, tree)).toBe('eligible_again');
});
