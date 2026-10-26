import { describe, expect, it } from 'vitest';
import {
	datesChanged,
	eventWorkPhase,
	groupEventWork,
	taskingSummaryRowSchema,
	taskingsToReview,
	type TaskingSummary
} from './eventWorkModel';
import type { Tasking } from './taskingModel';

const EVENT = { startsOn: '2026-10-19', endsOn: '2026-10-23' };

function tasking(id: string, title: string, suspenseOn: string, extra: Partial<Tasking> = {}): Tasking {
	return {
		id,
		title,
		event: null,
		responsibility: { kind: 'organization' },
		suspenseOn,
		execution: null,
		requirement: null,
		instructions: null,
		status: { kind: 'open' },
		readiness: { equipment: null, checklist: null },
		...extra
	};
}

function summary(id: string, title: string, suspenseOn: string): TaskingSummary {
	return {
		id,
		title,
		responsibility: { kind: 'group', name: 'Bravo' },
		status: 'open',
		requiredCount: null,
		suspenseOn,
		execution: null
	};
}

describe('eventWorkPhase', () => {
	it.each([
		['the day before the event starts', '2026-10-18', null, 'preparation'],
		['the first event day', '2026-10-19', null, 'execution'],
		['the last event day', '2026-10-23', null, 'execution'],
		['the day after the event ends', '2026-10-24', null, 'closeout'],
		[
			'an execution that starts before and runs into the event',
			'2026-10-25',
			['2026-10-17', '2026-10-19'],
			'execution'
		],
		['an execution that ends the day before the event', '2026-10-18', ['2026-10-15', '2026-10-18'], 'preparation'],
		[
			'an execution wholly after the event with a suspense before it',
			'2026-10-17',
			['2026-10-25', '2026-10-26'],
			'preparation'
		],
		['an execution wholly after the event', '2026-10-27', ['2026-10-25', '2026-10-26'], 'closeout']
	] as const)('puts %s in %s', (_case, suspenseOn, execution, phase) => {
		const dates = {
			suspenseOn,
			execution: execution ? { startsOn: execution[0], endsOn: execution[1] } : null
		};
		expect(eventWorkPhase(dates, EVENT)).toBe(phase);
	});
});

describe('groupEventWork', () => {
	it('orders phases, then suspense, outcome and id, mixing full and summary rows, and omits empty phases', () => {
		const groups = groupEventWork(
			EVENT,
			[
				tasking('b', 'Return borrowed equipment', '2026-10-26'),
				tasking('c', 'Submit the roster', '2026-10-15'),
				tasking('a', 'Brief the lanes', '2026-10-15')
			],
			[summary('s', 'Bravo roster', '2026-10-15'), summary('t', 'Bravo cleanup', '2026-10-30')]
		);

		expect(
			groups.map((group) => [
				group.phase,
				group.items.map((item) => (item.kind === 'full' ? item.tasking.id : item.summary.id))
			])
		).toEqual([
			['preparation', ['s', 'a', 'c']],
			['closeout', ['b', 't']]
		]);
	});

	it('returns nothing when no Tasking is linked', () => {
		expect(groupEventWork(EVENT, [], [])).toEqual([]);
	});
});

describe('taskingsToReview', () => {
	const later = { startsOn: '2026-10-26', endsOn: '2026-10-30' };

	it('lists active Taskings that moved phase or sit outside the new dates, never completed ones', () => {
		const inside = tasking('inside', 'Lane coverage', '2026-10-22');
		const movedOut = tasking('moved', 'Roster', '2026-10-21');
		const prep = tasking('prep', 'Warning order', '2026-10-12');
		const done = tasking('done', 'Old roster', '2026-10-21', {
			status: { kind: 'completed', note: null, at: 'x', by: null }
		});

		const review = taskingsToReview([inside, movedOut, prep, done], EVENT, later);

		expect(review.map(({ tasking: { id }, phase, movedFrom }) => [id, phase, movedFrom])).toEqual([
			['inside', 'preparation', 'execution'],
			['moved', 'preparation', 'execution'],
			['prep', 'preparation', null]
		]);
	});

	it('leaves a Tasking that stays inside the dates alone', () => {
		const inside = tasking('inside', 'Lane coverage', '2026-10-22');
		expect(taskingsToReview([inside], EVENT, { startsOn: '2026-10-20', endsOn: '2026-10-24' })).toEqual([]);
	});
});

describe('datesChanged', () => {
	it('compares both dates', () => {
		expect(datesChanged(EVENT, { ...EVENT })).toBe(false);
		expect(datesChanged(EVENT, { ...EVENT, endsOn: '2026-10-24' })).toBe(true);
	});
});

describe('taskingSummaryRowSchema', () => {
	const row = {
		id: 'x',
		title: 'Bravo litter teams',
		responsible_group_name: 'Bravo',
		status: 'blocked',
		staffing_required: 6,
		suspense_on: '2026-10-22',
		execution_starts_on: '2026-10-20',
		execution_ends_on: '2026-10-22'
	};

	it('reads a Group row and an Organization row', () => {
		expect(taskingSummaryRowSchema.parse(row)).toEqual({
			id: 'x',
			title: 'Bravo litter teams',
			responsibility: { kind: 'group', name: 'Bravo' },
			status: 'blocked',
			requiredCount: 6,
			suspenseOn: '2026-10-22',
			execution: { startsOn: '2026-10-20', endsOn: '2026-10-22' }
		});
		expect(taskingSummaryRowSchema.parse({ ...row, responsible_group_name: null })).toMatchObject({
			responsibility: { kind: 'organization' }
		});
	});

	it('refuses a row carrying any field beyond the summary', () => {
		expect(() => taskingSummaryRowSchema.parse({ ...row, block_reason: 'No vehicle' })).toThrow();
	});
});
