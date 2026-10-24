import { describe, expect, it, vi } from 'vitest';
import { createSupabaseRosterPresenceSignals } from './rosterPresenceSignals.server';

const TDY = { id: 'tdy', name: 'TDY', color: '#2563eb', textColor: '#ffffff', sortOrder: 0 };
const LEAVE = { id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', sortOrder: 1 };

describe('createSupabaseRosterPresenceSignals', () => {
	it('marks each cohort member present or away by the first-ranked status covering the day', async () => {
		const slices = vi.fn(async () => ({
			cohort: ['a', 'b', 'c'],
			statusTypes: [TDY, LEAVE],
			entries: [
				['e1', 'a', 'leave', '2026-10-01'],
				['e2', 'a', 'tdy', '2026-10-20'],
				['e3', 'b', 'leave', '2026-10-23']
			]
		}));
		const query = { asOf: '2026-10-23', personnelIds: null };
		const read = await createSupabaseRosterPresenceSignals(slices)(query);
		expect(slices).toHaveBeenCalledWith('availability', query);
		expect(read.statusTypes).toEqual([TDY, LEAVE]);
		expect([...read.today]).toEqual([
			['a', { kind: 'away', statusTypeId: 'tdy' }],
			['b', { kind: 'away', statusTypeId: 'leave' }],
			['c', { kind: 'present' }]
		]);
	});
});
