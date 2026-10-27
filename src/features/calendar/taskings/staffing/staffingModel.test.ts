import { describe, expect, it } from 'vitest';
import { pickReview, type TaskingPick } from './staffingModel';

const ALPHA = 'alpha';
const pick = (overrides: Partial<TaskingPick>): TaskingPick => ({
	personnelId: 'p1',
	rank: 'SPC',
	firstName: 'Pat',
	lastName: 'Lee',
	groupId: ALPHA,
	mos: '68W',
	clinicRole: '',
	archived: false,
	selectedAt: '2030-10-01T00:00:00Z',
	reviewSince: '2030-10-02T00:00:00Z',
	...overrides
});

describe('pickReview', () => {
	it.each([
		['a pick nobody flagged', pick({ reviewSince: null, archived: true }), null],
		['an archived person', pick({ archived: true, groupId: 'bravo' }), 'archived'],
		['someone who left the responsible Group', pick({ groupId: 'bravo' }), 'left_group'],
		['someone restored to the Group, still awaiting a decision', pick({}), 'eligible_again']
	] as const)('names %s', (_who, flagged, expected) => {
		expect(pickReview(flagged, { kind: 'group', groupId: ALPHA })).toBe(expected);
	});

	it('never calls a Group move a reason on Organization-level work', () => {
		expect(pickReview(pick({ groupId: null }), { kind: 'organization' })).toBe('eligible_again');
	});
});
