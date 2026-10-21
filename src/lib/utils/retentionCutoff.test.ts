import { describe, expect, it } from 'vitest';
import { nextCleanupRun, retentionCutoff, retentionDeletionDate } from './retentionCutoff';

const cases = [
	{
		name: 'archived before the run hour',
		archivedAt: '2024-11-02T03:00:00.000Z',
		months: 24,
		run: '2026-11-02T05:00:00.000Z'
	},
	{
		name: 'archived after the run hour',
		archivedAt: '2024-11-02T14:00:00.000Z',
		months: 24,
		run: '2026-11-03T05:00:00.000Z'
	},
	{
		name: 'archived a millisecond before the run hour',
		archivedAt: '2024-11-02T04:59:59.999Z',
		months: 24,
		run: '2026-11-02T05:00:00.000Z'
	},
	{
		name: 'archived exactly at the run hour',
		archivedAt: '2024-11-02T05:00:00.000Z',
		months: 24,
		run: '2026-11-02T05:00:00.000Z'
	},
	{
		name: '31 Jan into a 28-day February',
		archivedAt: '2025-01-31T12:00:00.000Z',
		months: 1,
		run: '2025-03-01T05:00:00.000Z'
	},
	{
		name: '31 Mar into a 30-day April',
		archivedAt: '2025-03-31T04:00:00.000Z',
		months: 1,
		run: '2025-05-01T05:00:00.000Z'
	},
	{
		name: '31 Jan into a 31-day March',
		archivedAt: '2025-01-31T04:00:00.000Z',
		months: 2,
		run: '2025-03-31T05:00:00.000Z'
	},
	{ name: '31 Aug with 6 months', archivedAt: '2025-08-31T12:00:00.000Z', months: 6, run: '2026-03-01T05:00:00.000Z' },
	{
		name: 'leap day into a common year',
		archivedAt: '2024-02-29T12:00:00.000Z',
		months: 12,
		run: '2025-03-01T05:00:00.000Z'
	},
	{
		name: 'leap day into a leap year, before the run hour',
		archivedAt: '2024-02-29T03:00:00.000Z',
		months: 48,
		run: '2028-02-29T05:00:00.000Z'
	},
	{
		name: 'leap day into a leap year, after the run hour',
		archivedAt: '2024-02-29T12:00:00.000Z',
		months: 48,
		run: '2028-03-01T05:00:00.000Z'
	},
	{ name: 'across a year end', archivedAt: '2025-12-15T10:00:00.000Z', months: 3, run: '2026-03-16T05:00:00.000Z' },
	{
		name: 'the 120-month maximum',
		archivedAt: '2020-06-10T00:00:00.000Z',
		months: 120,
		run: '2030-06-10T05:00:00.000Z'
	}
];

describe('retentionDeletionDate', () => {
	it.each(cases)('$name', ({ archivedAt, months, run }) => {
		const deletion = retentionDeletionDate(archivedAt, months);

		expect(deletion.toISOString()).toBe(run);
		expect(archivedAt <= retentionCutoff(deletion, months)).toBe(true);
		const dayBefore = new Date(deletion.getTime() - 24 * 60 * 60 * 1000);
		expect(archivedAt <= retentionCutoff(dayBefore, months)).toBe(false);
	});

	it('accepts a Date', () => {
		expect(retentionDeletionDate(new Date('2024-11-02T03:00:00.000Z'), 24).toISOString()).toBe(
			'2026-11-02T05:00:00.000Z'
		);
	});

	it.each([
		{ archivedAt: 'not a date', months: 24 },
		{ archivedAt: '2024-11-02T03:00:00.000Z', months: 0 },
		{ archivedAt: '2024-11-02T03:00:00.000Z', months: 1.5 },
		{ archivedAt: '2024-11-02T03:00:00.000Z', months: Number.NaN }
	])('rejects archivedAt=$archivedAt months=$months', ({ archivedAt, months }) => {
		expect(() => retentionDeletionDate(archivedAt, months)).toThrow(RangeError);
	});
});

describe('nextCleanupRun', () => {
	it.each([
		{ now: '2026-10-21T04:59:59.000Z', run: '2026-10-21T05:00:00.000Z' },
		{ now: '2026-10-21T05:00:00.000Z', run: '2026-10-22T05:00:00.000Z' },
		{ now: '2026-12-31T23:00:00.000Z', run: '2027-01-01T05:00:00.000Z' }
	])('after $now is $run', ({ now, run }) => {
		expect(nextCleanupRun(new Date(now)).toISOString()).toBe(run);
	});
});
