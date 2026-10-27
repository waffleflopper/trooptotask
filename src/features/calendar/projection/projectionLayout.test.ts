import { describe, expect, it } from 'vitest';
import { toDayNumber } from '$lib/utils/dayNumber';
import { indexSpan, packRows } from './projectionLayout';

const first = toDayNumber('2026-05-01');
const span = (id: string, startsOn: string, endsOn: string) => indexSpan({ id, startsOn, endsOn }, first);
const placement = (packing: ReturnType<typeof packRows<{ id: string }>>) =>
	packing.runs.map(({ item, row, start, end }) => [item.id, row, start, end]);

describe('packRows', () => {
	it('shows a multi-day item as one run on the top row', () => {
		const packing = packRows([span('a', '2026-05-03', '2026-05-06')], 2, 31);

		expect(placement(packing)).toEqual([['a', 0, 2, 5]]);
		expect(packing.overflow).toEqual([]);
	});

	it('clips an item that starts before the first day and marks that it continues', () => {
		const { runs } = packRows([span('a', '2026-04-28', '2026-05-02')], 2, 31);

		expect(runs).toEqual([expect.objectContaining({ start: 0, end: 1, continuesBefore: true, continuesAfter: false })]);
	});

	it('drops an overlapping item to the next row whole, and back to the top row once it is free', () => {
		const packing = packRows(
			[
				span('a', '2026-05-03', '2026-05-08'),
				span('b', '2026-05-05', '2026-05-06'),
				span('c', '2026-05-10', '2026-05-12')
			],
			2,
			31
		);

		expect(placement(packing)).toEqual([
			['a', 0, 2, 7],
			['c', 0, 9, 11],
			['b', 1, 4, 5]
		]);
	});

	it('overflows an item no row has room for rather than adding a row', () => {
		const spans = ['a', 'b', 'c', 'd'].map((id) => span(id, '2026-05-10', '2026-05-10'));

		const packing = packRows(spans, 2, 31);

		expect(placement(packing).map(([id, row]) => [id, row])).toEqual([
			['a', 0],
			['b', 1]
		]);
		expect(packing.overflow.map((item) => item.id)).toEqual(['c', 'd']);
	});

	it('ignores an item wholly outside the shown days', () => {
		expect(packRows([span('a', '2026-06-02', '2026-06-03')], 2, 31)).toEqual({ runs: [], overflow: [] });
	});
});
