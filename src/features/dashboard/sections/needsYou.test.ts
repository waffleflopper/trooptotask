import { describe, expect, it } from 'vitest';
import { buildNeedsYouQueue, needsYouKindInfo, type NeedsYouItem } from './needsYou';

const base = { subtitle: '', timing: '', href: '/org/org-1', action: null };

function overdue(id: string, title: string, daysLate: number): NeedsYouItem {
	return { ...base, id, title, kind: 'overdue', urgency: { daysLate }, ratingSchemeEntryId: id };
}

function expired(id: string, title: string, daysLate: number): NeedsYouItem {
	return { ...base, id, title, kind: 'expired', urgency: { daysLate }, trainingTypeId: id, personnelIds: [] };
}

function unfilled(id: string, title: string, date: string): NeedsYouItem {
	return { ...base, id, title, kind: 'unfilled', urgency: { date }, assignmentTypeId: id, openDates: [date] };
}

function leaving(id: string, title: string, date: string): NeedsYouItem {
	return { ...base, id, title, kind: 'leaving', urgency: { date }, personnelId: id };
}

const ids = (items: readonly NeedsYouItem[]) => items.map((item) => item.id);

describe('buildNeedsYouQueue', () => {
	it('ranks every overdue row above expired, unfilled and leaving rows, whichever source supplied it', () => {
		const queue = buildNeedsYouQueue([
			[leaving('patel', 'SPC Patel ETS', '2026-10-20'), unfilled('staff', 'Staff duty', '2026-10-21')],
			[expired('sharp', 'SHARP', 40)],
			[overdue('alvarez', 'NCOER Alvarez', 1)]
		]);

		expect(ids(queue.rows)).toEqual(['alvarez', 'sharp', 'staff', 'patel']);
	});

	it('puts the most late first for late kinds and the soonest date first for dated kinds', () => {
		const queue = buildNeedsYouQueue([
			[
				overdue('a', 'NCOER A', 2),
				overdue('b', 'NCOER B', 9),
				unfilled('cq', 'CQ', '2026-10-27'),
				unfilled('staff', 'Staff duty', '2026-10-20')
			]
		]);

		expect(ids(queue.rows)).toEqual(['b', 'a', 'staff', 'cq']);
	});

	it('breaks an urgency tie by title and then by id', () => {
		const queue = buildNeedsYouQueue([
			[overdue('2', 'NCOER Brooks', 6), overdue('3', 'NCOER Alvarez', 6), overdue('1', 'NCOER Brooks', 6)]
		]);

		expect(ids(queue.rows)).toEqual(['3', '1', '2']);
	});

	it('shows nine rows in full with no fold', () => {
		const items = Array.from({ length: 9 }, (_, day) => leaving(`p${day}`, `Person ${day}`, `2026-11-0${day + 1}`));

		const queue = buildNeedsYouQueue([items]);

		expect(queue.rows).toHaveLength(9);
		expect(queue.fold).toBeNull();
	});

	it('folds ten rows to the top seven and summarizes the other three', () => {
		const items = Array.from({ length: 10 }, (_, day) =>
			leaving(`p${day}`, `Person ${day}`, `2026-11-${String(day + 1).padStart(2, '0')}`)
		);

		const queue = buildNeedsYouQueue([items.slice(5), items.slice(0, 5)]);

		expect(ids(queue.rows)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
		expect(queue.fold).toEqual({ count: 3, titles: ['Person 7', 'Person 8', 'Person 9'] });
		expect(queue.ranked).toHaveLength(10);
	});

	it('returns an empty queue with no fold when no source has items', () => {
		expect(buildNeedsYouQueue([[], []])).toEqual({ ranked: [], rows: [], fold: null });
	});
});

describe('Tasking kinds in the queue', () => {
	const lateTasking = (id: string, daysLate: number): NeedsYouItem => ({
		...base,
		id,
		title: id,
		kind: 'taskingOverdue',
		taskingId: id,
		urgency: { daysLate }
	});
	const datedTasking = (
		id: string,
		kind: 'taskingBlocked' | 'taskingShort' | 'taskingConflict',
		date: string
	): NeedsYouItem => ({ ...base, id, title: id, kind, taskingId: id, urgency: { date } });

	it('ranks overdue Taskings with overdue evaluations by days late, then expired, then blocked Taskings', () => {
		const queue = buildNeedsYouQueue([
			[datedTasking('blocked', 'taskingBlocked', '2026-10-20'), expired('sharp', 'SHARP', 40)],
			[overdue('eval', 'NCOER', 5), lateTasking('late', 12)]
		]);

		expect(ids(queue.rows)).toEqual(['late', 'eval', 'sharp', 'blocked']);
	});

	it('ranks conflicts ahead of Short Taskings and Unfilled duty, then orders those by date', () => {
		const queue = buildNeedsYouQueue([
			[
				datedTasking('soon', 'taskingConflict', '2026-10-20'),
				datedTasking('short', 'taskingShort', '2026-10-22'),
				unfilled('duty', 'Staff duty', '2026-10-21')
			]
		]);

		expect(ids(queue.rows)).toEqual(['soon', 'duty', 'short']);
	});

	it('labels each kind and colours it by severity', () => {
		expect(
			(['taskingOverdue', 'taskingBlocked', 'taskingShort', 'taskingConflict'] as const).map((kind) => {
				const { label, severity } = needsYouKindInfo(kind);
				return [label, severity];
			})
		).toEqual([
			['Overdue', 'danger'],
			['Blocked', 'danger'],
			['Short', 'warning'],
			['Conflict', 'warning']
		]);
	});
});
