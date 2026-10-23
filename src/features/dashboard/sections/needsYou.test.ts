import { describe, expect, it } from 'vitest';
import { buildNeedsYouQueue, type NeedsYouItem } from './needsYou';

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
