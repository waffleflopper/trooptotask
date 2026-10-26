import { describe, expect, it } from 'vitest';
import { toDayNumber } from '$lib/utils/dayNumber';
import { indexSpan, layoutSingleRow } from './projectionLayout';

const first = toDayNumber('2026-05-01');
const span = (id: string, startsOn: string, endsOn: string) => indexSpan({ id, startsOn, endsOn }, first);
const idOf = (item: { id: string }) => item.id;

describe('layoutSingleRow', () => {
	it('shows a multi-day item as one run', () => {
		const { runs, overflows } = layoutSingleRow([span('a', '2026-05-03', '2026-05-06')], 31, idOf);

		expect(runs.map(({ item, start, end }) => [item.id, start, end])).toEqual([['a', 2, 5]]);
		expect(overflows).toEqual([]);
	});

	it('clips an item that starts before the first day and marks that it continues', () => {
		const { runs } = layoutSingleRow([span('a', '2026-04-28', '2026-05-02')], 31, idOf);

		expect(runs).toEqual([expect.objectContaining({ start: 0, end: 1, continuesBefore: true, continuesAfter: false })]);
	});

	it('counts the items an earlier one covers in an overflow, not in a second row', () => {
		const { runs, overflows } = layoutSingleRow(
			[
				span('a', '2026-05-03', '2026-05-08'),
				span('b', '2026-05-05', '2026-05-06'),
				span('c', '2026-05-06', '2026-05-12')
			],
			31,
			idOf
		);

		expect(runs.map(({ item, start, end }) => [item.id, start, end])).toEqual([
			['a', 2, 7],
			['c', 8, 11]
		]);
		expect(overflows.map(({ start, end, hidden }) => [start, end, hidden.map(idOf)])).toEqual([
			[4, 4, ['b']],
			[5, 5, ['b', 'c']],
			[6, 7, ['c']]
		]);
	});

	it('never shows more than one item on a day however many cover it', () => {
		const spans = ['a', 'b', 'c', 'd', 'e'].map((id) => span(id, '2026-05-10', '2026-05-10'));

		const { runs, overflows } = layoutSingleRow(spans, 31, idOf);

		expect(runs).toHaveLength(1);
		expect(overflows).toEqual([{ start: 9, end: 9, hidden: expect.arrayContaining([expect.anything()]) }]);
		expect(overflows[0].hidden).toHaveLength(4);
	});
});
