import { describe, expect, it } from 'vitest';
import { placeForecastLaneMarks, type ForecastLaneMark } from './forecastLanes';

const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24'];

const base = (id: string) => ({ id, title: id, detail: id, label: id, href: `/${id}` });
const span = (id: string, start: string, end: string): ForecastLaneMark => ({
	...base(id),
	kind: 'span',
	start,
	end,
	emphasis: 'strong'
});
const point = (id: string, date: string): ForecastLaneMark => ({ ...base(id), kind: 'point', date });

function shown(marks: readonly ForecastLaneMark[]) {
	return placeForecastLaneMarks(days, marks).map(({ id, column, span, more }) => ({
		id,
		from: days[column - 1],
		to: days[column + span - 2],
		more: more.map((mark) => mark.id)
	}));
}

describe('placeForecastLaneMarks', () => {
	it('clips a span to the forecast window, keeps a point on its day and drops marks outside it', () => {
		expect(
			shown([
				span('exercise', '2026-10-17', '2026-10-20'),
				point('suspense', '2026-10-22'),
				span('later', '2026-10-25', '2026-10-27')
			])
		).toEqual([
			{ id: 'exercise', from: '2026-10-19', to: '2026-10-20', more: [] },
			{ id: 'suspense', from: '2026-10-22', to: '2026-10-22', more: [] }
		]);
	});

	it('shows two overlapping Events and lists a third with the one it overlaps, and a day’s later points with its first', () => {
		expect(
			shown([
				point('due-a', '2026-10-21'),
				span('ftx', '2026-10-19', '2026-10-21'),
				span('visit', '2026-10-20', '2026-10-20'),
				span('late', '2026-10-20', '2026-10-22'),
				span('range', '2026-10-23', '2026-10-24'),
				point('due-b', '2026-10-21'),
				point('due-c', '2026-10-21')
			])
		).toEqual([
			{ id: 'ftx', from: '2026-10-19', to: '2026-10-21', more: [] },
			{ id: 'late', from: '2026-10-20', to: '2026-10-22', more: ['visit'] },
			{ id: 'range', from: '2026-10-23', to: '2026-10-24', more: [] },
			{ id: 'due-a', from: '2026-10-21', to: '2026-10-21', more: ['due-b', 'due-c'] }
		]);
	});
});
