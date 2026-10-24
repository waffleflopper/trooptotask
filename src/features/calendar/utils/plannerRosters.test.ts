import { describe, expect, it } from 'vitest';
import type { PlannerRoster } from '$features/calendar/contracts';
import { decodePlannerRosters, indexSwappedDays, swapsEndedBy } from './plannerRosters';

const swap = {
	id: 'swap-1',
	days: [
		{ date: '2026-10-12', heldBy: 'p-kim' },
		{ date: '2026-10-19', heldBy: 'p-patel' }
	]
} as const;
const other = {
	id: 'swap-2',
	days: [
		{ date: '2026-10-14', heldBy: 'p-moss' },
		{ date: '2026-11-02', heldBy: 'p-reed' }
	]
} as const;

describe('indexSwappedDays', () => {
	it('lists each day of a swap with who held it and the day it was traded for, including a day outside the month', () => {
		const days = indexSwappedDays([swap, other]);

		expect(days.get('2026-10-12')).toMatchObject({ heldBy: 'p-kim', otherDate: '2026-10-19', otherHeldBy: 'p-patel' });
		expect(days.get('2026-10-19')).toMatchObject({ heldBy: 'p-patel', otherDate: '2026-10-12', otherHeldBy: 'p-kim' });
		expect(days.get('2026-11-02')).toMatchObject({ heldBy: 'p-reed', otherDate: '2026-10-14' });
		expect(days.has('2026-10-13')).toBe(false);
	});
});

describe('swapsEndedBy', () => {
	// Patel stands the 12th and Kim the 19th.
	const holders: Record<string, string> = { '2026-10-12': 'p-patel', '2026-10-19': 'p-kim', '2026-10-14': 'p-reed' };
	const holderOn = (date: string) => holders[date];

	it('counts a swap once when either or both of its days move to someone else', () => {
		expect(swapsEndedBy([swap], [{ date: '2026-10-12', assigneeId: 'p-moss' }], holderOn)).toBe(1);
		expect(
			swapsEndedBy(
				[swap],
				[
					{ date: '2026-10-12', assigneeId: '' },
					{ date: '2026-10-19', assigneeId: 'p-moss' }
				],
				holderOn
			)
		).toBe(1);
	});

	it('keeps a swap when its days are saved again for the people holding them or are not written at all', () => {
		expect(
			swapsEndedBy(
				[swap, other],
				[
					{ date: '2026-10-12', assigneeId: 'p-patel' },
					{ date: '2026-10-13', assigneeId: 'p-moss' }
				],
				holderOn
			)
		).toBe(0);
	});

	it('counts only the swaps a write reaches', () => {
		expect(swapsEndedBy([swap, other], [{ date: '2026-10-14', assigneeId: 'p-kim' }], holderOn)).toBe(1);
	});
});

describe('decodePlannerRosters', () => {
	it("carries a roster's swaps to its view", () => {
		const roster: PlannerRoster = {
			typeId: 'type-sd',
			people: [],
			effects: [],
			current: null,
			todayAssignee: null,
			excused: [],
			covered: [],
			swaps: [swap],
			conflicts: []
		};

		expect(decodePlannerRosters([roster]).get('type-sd')?.swaps).toEqual([swap]);
	});
});
