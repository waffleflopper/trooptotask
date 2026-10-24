import { describe, expect, it } from 'vitest';
import { closeForm, countChanges, da6Segment, simulateRoster, withAssignment } from './rosterEngine';
import { assigned, gridLines, swapExample } from './rosterFixtures.test-support';
import { remarkText } from '../utils/da6View';

describe('published duty swaps', () => {
	it('keeps the published grid, counts today and the next rotation while changing who stands the days', () => {
		const before = simulateRoster(swapExample());
		const after = simulateRoster(swapExample(true));
		const expected = ['SPC Kim *6 1', 'SPC Moss 1 2', 'SPC Patel 4 *5'];
		for (const facts of [swapExample(), swapExample(true), swapExample()]) {
			const run = simulateRoster(facts);
			expect(gridLines(da6Segment(run, '2026-10')!)).toEqual(expected);
			expect(run.current).toEqual([
				{
					track: 'all',
					counts: [
						{ personId: 'moss', count: 2, effect: { code: 'available' } },
						{ personId: 'kim', count: 1, effect: { code: 'available' } },
						{ personId: 'patel', count: 0, effect: { code: 'available' } }
					]
				}
			]);
			expect(
				simulateRoster(facts, { kind: 'fill', days: { from: '2026-10-20', through: '2026-10-23' } }).changes.map(
					({ date, personId, count }) => [date, personId, count]
				)
			).toEqual([
				['2026-10-20', 'moss', 3],
				['2026-10-21', 'kim', 3],
				['2026-10-22', 'patel', 3],
				['2026-10-23', 'moss', 3]
			]);
		}
		expect(countChanges(before, after)).toEqual([]);
		const segment = da6Segment(after, '2026-10')!;
		expect(segment.columns[0]).toMatchObject({ pick: { personId: 'patel' }, source: 'manual', rulePick: null });
		expect(after.byDate.get('2026-10-12')?.detail).toMatchObject({ personId: 'patel', heldBy: 'kim', onRoster: true });
		expect(segment.remarks).toEqual([
			{
				kind: 'swapped',
				who: { personId: 'kim', rank: 'SPC', firstName: '', lastName: 'Kim' },
				on: '2026-10-12',
				with: { personId: 'patel', rank: 'SPC', firstName: '', lastName: 'Patel' },
				other: '2026-10-19'
			}
		]);
		expect(remarkText(segment.remarks[0], '2026-10-12')).toBe(
			'SPC Kim and SPC Patel exchanged 12 and 19 Oct. Numbers as published.'
		);
		expect(closeForm(swapExample(true), '2026-10-20').segments[0].remarks).toEqual(segment.remarks);
	});

	it.each([
		['2026-10-12', 'patel'],
		['2026-10-19', 'kim']
	])('keeps the exchange and published counts when %s stays assigned to %s', (date, assigneeId) => {
		const facts = withAssignment(swapExample(true), { date, assigneeId, source: 'manual' });
		expect(facts.swaps).toEqual([
			{
				id: 'swap-1',
				days: [
					{ date: '2026-10-12', heldBy: 'kim' },
					{ date: '2026-10-19', heldBy: 'patel' }
				]
			}
		]);
		expect(gridLines(da6Segment(simulateRoster(facts), '2026-10')!)).toEqual([
			'SPC Kim *6 1',
			'SPC Moss 1 2',
			'SPC Patel 4 *5'
		]);
	});

	it('ends the entire exchange on reassignment and then charges the current holders', () => {
		const facts = withAssignment(swapExample(true), { date: '2026-10-12', assigneeId: 'moss', source: 'manual' });
		expect(facts.swaps).toEqual([]);
		expect(gridLines(da6Segment(simulateRoster(facts), '2026-10')!)).toEqual([
			'SPC Kim 6 *7',
			'SPC Moss *1 1',
			'SPC Patel 4 5'
		]);
	});

	it('charges the original holder when the person standing the day is on the roster and the holder is excused', () => {
		const facts = {
			...swapExample(true),
			excusals: [{ personId: 'kim', reason: 'Excused', from: '2026-10-12', through: null }]
		};
		const run = simulateRoster(facts);
		expect(run.byDate.get('2026-10-12')?.detail).toMatchObject({ personId: 'patel', heldBy: 'kim', onRoster: false });
		expect(gridLines(da6Segment(run, '2026-10')!)).toEqual(['SPC Moss 1 2', 'SPC Patel 4 *5']);
		expect(da6Segment(run, '2026-10')!.remarks.filter((remark) => remark.kind === 'outside')).toEqual([
			{ kind: 'outside', who: { personId: 'kim', rank: 'SPC', lastName: 'Kim', firstName: '' }, date: '2026-10-12' }
		]);
	});

	it('keeps the exchange in both monthly remarks and frozen records', () => {
		const base = swapExample(true);
		const swap = {
			id: 'cross-month',
			days: [
				{ date: '2026-10-30', heldBy: 'kim' },
				{ date: '2026-11-02', heldBy: 'patel' }
			]
		} as const;
		const run = simulateRoster({
			...base,
			window: { from: '2026-10-12', through: '2026-11-02' },
			assignments: [assigned('2026-10-30', 'patel'), assigned('2026-11-02', 'kim')],
			swaps: [swap]
		});
		for (const month of ['2026-10', '2026-11']) {
			const remarks = da6Segment(run, month)!.remarks;
			expect(remarks).toHaveLength(1);
			expect(remarkText(remarks[0], '2026-10-12')).toBe(
				'SPC Kim and SPC Patel exchanged 30 Oct and 2 Nov. Numbers as published.'
			);
		}
	});
});
