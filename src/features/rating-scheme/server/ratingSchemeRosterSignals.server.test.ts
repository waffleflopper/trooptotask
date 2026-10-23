import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseRatingSchemeRosterSignals } from './ratingSchemeRosterSignals.server';

describe('createSupabaseRatingSchemeRosterSignals', () => {
	it('projects each active evaluation for the viewer day and leaves a cohort member without one as null', async () => {
		const rpc = vi.fn(async () => ({
			data: {
				cohort: ['a', 'b'],
				entries: [['a', 'e1', 'NCOER', 'AN', '2025-12-07', '2026-12-07', 'active', 'drafting']]
			},
			error: null
		}));
		const read = await createSupabaseRatingSchemeRosterSignals(
			{ rpc } as unknown as SupabaseClient,
			'org-1'
		)({
			asOf: '2026-10-23',
			personnelIds: null
		});
		expect(rpc).toHaveBeenCalledWith('roster_signal_evaluations', {
			p_organization_id: 'org-1',
			p_personnel_ids: null
		});
		expect(read.get('b')).toBeNull();
		expect(read.get('a')).toMatchObject({
			entryId: 'e1',
			periodEnd: '2026-12-07',
			daysUntilThru: 45,
			dueStatus: 'due-60',
			workflowStatus: 'drafting'
		});
	});
});
