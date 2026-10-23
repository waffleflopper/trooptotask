import { describe, expect, it } from 'vitest';
import { placeForecastLaneMarks } from './forecastLanes';

const days = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22'];

describe('placeForecastLaneMarks', () => {
	it('clips a span to the forecast window, keeps a point on its day and drops marks outside it', () => {
		const placed = placeForecastLaneMarks(days, [
			{ kind: 'span', id: 'exercise', start: '2026-10-17', end: '2026-10-20', label: 'FTX', emphasis: 'strong' },
			{ kind: 'point', id: 'suspense', date: '2026-10-22', label: 'Packet due' },
			{ kind: 'span', id: 'later', start: '2026-10-23', end: '2026-10-25', label: 'Range', emphasis: 'quiet' }
		]);

		expect(placed.map(({ id, column, span }) => ({ id, column, span }))).toEqual([
			{ id: 'exercise', column: 1, span: 2 },
			{ id: 'suspense', column: 4, span: 1 }
		]);
	});
});
