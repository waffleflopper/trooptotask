import { describe, expect, it } from 'vitest';
import { deletionCountdown } from './archiveCountdown';

const today = new Date('2026-10-19T12:00:00Z');

describe('deletionCountdown', () => {
	it.each([
		['2024-11-02T04:00:00Z', '14 days', true],
		['2025-06-18T04:00:00Z', '8 months', false],
		['2025-09-30T04:00:00Z', '11 months', false],
		['2026-01-14T04:00:00Z', '15 months', false],
		['2026-04-03T04:00:00Z', '17 months', false],
		['2026-08-22T04:00:00Z', '22 months', false]
	])('counts a person archived %s under 24-month retention down to %s', (archivedAt, label, soon) => {
		expect(deletionCountdown(archivedAt, 24, today)).toMatchObject({ label, soon });
	});

	it('ends each day at the 05:00 UTC cleanup run and turns amber from 30 days left', () => {
		const archivedAt = '2024-11-02T04:00:00Z';
		expect(deletionCountdown(archivedAt, 24, new Date('2026-10-03T04:59:00Z'))).toMatchObject({
			label: '31 days',
			soon: false
		});
		expect(deletionCountdown(archivedAt, 24, new Date('2026-10-03T05:00:00Z'))).toMatchObject({
			label: '30 days',
			soon: true
		});
		expect(deletionCountdown(archivedAt, 24, new Date('2026-11-01T06:00:00Z'))).toMatchObject({
			label: '1 day',
			soon: true
		});
	});

	it('switches from days to months at 60 days left', () => {
		const archivedAt = '2024-11-02T04:00:00Z';
		expect(deletionCountdown(archivedAt, 24, new Date('2026-09-04T05:00:00Z')).label).toBe('59 days');
		expect(deletionCountdown(archivedAt, 24, new Date('2026-09-03T05:00:00Z')).label).toBe('2 months');
	});

	it('reads Due now with a full bar once the date passes before the cleanup has run', () => {
		expect(deletionCountdown('2024-11-02T04:00:00Z', 24, new Date('2026-11-02T06:00:00Z'))).toEqual({
			label: 'Due now',
			elapsed: 1,
			soon: true
		});
	});

	it('fills the bar with the share of the retention period already passed', () => {
		expect(deletionCountdown('2025-11-02T05:00:00Z', 12, new Date('2026-05-03T17:00:00Z')).elapsed).toBe(0.5);
		expect(deletionCountdown('2026-10-19T12:00:00Z', 12, today).elapsed).toBe(0);
	});
});
