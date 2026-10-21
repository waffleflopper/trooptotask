import { describe, expect, it } from 'vitest';
import type { AvailabilityEntry } from '$features/calendar/contracts';
import { availabilityRuns, backDate } from './availabilityRuns';

function entry(id: string, personnelId: string, startDate: string, endDate: string): AvailabilityEntry {
	return { id, personnelId, statusTypeId: 'leave', startDate, endDate } as AvailabilityEntry;
}

describe('availabilityRuns', () => {
	it('joins overlapping and back-to-back entries and splits at an uncovered day', () => {
		const runs = availabilityRuns([
			entry('tdy', 'p-okafor', '2026-10-20', '2026-10-22'),
			entry('leave', 'p-okafor', '2026-10-12', '2026-10-19'),
			entry('appointment', 'p-okafor', '2026-10-14', '2026-10-15'),
			entry('cq', 'p-okafor', '2026-10-24', '2026-10-24'),
			entry('leave-liang', 'p-liang', '2026-10-21', '2026-10-21')
		]);

		expect(
			[...runs].map(([personnelId, own]) => [
				personnelId,
				own.map((run) => [run.first.id, run.startDate, run.endDate, backDate(run)])
			])
		).toEqual([
			[
				'p-okafor',
				[
					['leave', '2026-10-12', '2026-10-22', '2026-10-23'],
					['cq', '2026-10-24', '2026-10-24', '2026-10-25']
				]
			],
			['p-liang', [['leave-liang', '2026-10-21', '2026-10-21', '2026-10-22']]]
		]);
	});
});
