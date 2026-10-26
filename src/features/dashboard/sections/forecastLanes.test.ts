import { describe, expect, it } from 'vitest';
import { placeForecastLaneMarks, type ForecastLaneMark } from './forecastLanes';

const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];

const span = (id: string, start: string, end: string): ForecastLaneMark => ({
	kind: 'span',
	id,
	start,
	end,
	title: id,
	label: id,
	href: `/${id}`,
	emphasis: 'strong'
});
const point = (id: string, date: string): ForecastLaneMark => ({ kind: 'point', id, date, label: id, href: `/${id}` });

function placed(marks: readonly ForecastLaneMark[]) {
	return placeForecastLaneMarks(days, marks).map(({ id, column, span, row, room }) => ({
		id,
		column,
		span,
		row,
		room
	}));
}

describe('placeForecastLaneMarks', () => {
	it('clips a span to the forecast window, keeps a point on its day and drops marks outside it', () => {
		expect(
			placed([
				span('exercise', '2026-10-17', '2026-10-20'),
				point('suspense', '2026-10-22'),
				span('later', '2026-10-25', '2026-10-27')
			])
		).toEqual([
			{ id: 'exercise', column: 1, span: 2, row: 1, room: 4 },
			{ id: 'suspense', column: 4, span: 1, row: 3, room: 0 }
		]);
	});

	it('packs overlapping spans into rows, stops room at the next span and stacks same-day points below every span', () => {
		expect(
			placed([
				point('due-a', '2026-10-21'),
				span('ftx', '2026-10-19', '2026-10-21'),
				span('visit', '2026-10-20', '2026-10-20'),
				span('range', '2026-10-23', '2026-10-24'),
				point('due-b', '2026-10-21')
			])
		).toEqual([
			{ id: 'ftx', column: 1, span: 3, row: 1, room: 1 },
			{ id: 'visit', column: 2, span: 1, row: 2, room: 4 },
			{ id: 'range', column: 5, span: 2, row: 1, room: 0 },
			{ id: 'due-a', column: 3, span: 1, row: 3, room: 0 },
			{ id: 'due-b', column: 3, span: 1, row: 4, room: 0 }
		]);
	});
});
