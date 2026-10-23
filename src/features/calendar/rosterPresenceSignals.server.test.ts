import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRosterPresenceSignals } from './rosterPresenceSignals.server';

const TDY = { id: 'tdy', name: 'TDY', color: '#2563eb', textColor: '#ffffff', sortOrder: 0 };
const LEAVE = { id: 'leave', name: 'Leave', color: '#16a34a', textColor: '#ffffff', sortOrder: 1 };

describe('createSupabaseRosterPresenceSignals', () => {
	it('marks each cohort member present or away by the first-ranked status covering the day', async () => {
		const rpc = vi.fn(async () => ({
			data: {
				cohort: ['a', 'b', 'c'],
				statusTypes: [TDY, LEAVE],
				entries: [
					['e1', 'a', 'leave', '2026-10-01'],
					['e2', 'a', 'tdy', '2026-10-20'],
					['e3', 'b', 'leave', '2026-10-23']
				]
			},
			error: null
		}));
		const read = await createSupabaseRosterPresenceSignals(
			{ rpc } as unknown as SupabaseClient,
			'org-1'
		)({
			asOf: '2026-10-23',
			personnelIds: null
		});
		expect(rpc).toHaveBeenCalledWith('roster_signal_presence', {
			p_organization_id: 'org-1',
			p_as_of: '2026-10-23',
			p_personnel_ids: null
		});
		expect(read.statusTypes).toEqual([TDY, LEAVE]);
		expect([...read.today]).toEqual([
			['a', { kind: 'away', statusTypeId: 'tdy' }],
			['b', { kind: 'away', statusTypeId: 'leave' }],
			['c', { kind: 'present' }]
		]);
	});
});
