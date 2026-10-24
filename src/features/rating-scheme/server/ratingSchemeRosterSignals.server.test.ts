import { describe, expect, it, vi } from 'vitest';
import { createSupabaseRatingSchemeRosterSignals } from './ratingSchemeRosterSignals.server';

describe('createSupabaseRatingSchemeRosterSignals', () => {
	it('projects each active evaluation for the viewer day and leaves a cohort member without one as null', async () => {
		const slices = vi.fn(async () => ({
			cohort: ['a', 'b'],
			entries: [['a', 'e1', 'NCOER', 'AN', '2025-12-07', '2026-12-07', 'active', 'drafting']]
		}));
		const query = { asOf: '2026-10-23', personnelIds: null };
		const read = await createSupabaseRatingSchemeRosterSignals(slices)(query);
		expect(slices).toHaveBeenCalledWith('evaluations', query);
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
