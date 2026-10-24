import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseTrainingRosterSignals } from './trainingRosterSignals.server';

const TYPE = {
	id: 'cpr',
	name: 'CPR/BLS',
	expiration_months: 24,
	warning_days_yellow: 60,
	warning_days_orange: 30,
	applies_to_roles: [],
	applies_to_mos: ['68W'],
	applies_to_ranks: [],
	excluded_roles: [],
	excluded_mos: [],
	excluded_ranks: [],
	expiration_date_only: false,
	can_be_exempted: false,
	exempt_personnel_ids: [],
	is_optional: false
};

describe('createSupabaseTrainingRosterSignals', () => {
	it('builds each cohort member required training from one read', async () => {
		const rpc = vi.fn(async () => ({
			data: {
				cohort: [
					['a', 'SGT', '68W', ''],
					['b', 'SPC', '68W', ''],
					['c', 'SPC', '11B', '']
				],
				types: [TYPE],
				completions: [['a', 'cpr', '2024-10-01', '2026-10-01']]
			},
			error: null
		}));
		const read = await createSupabaseTrainingRosterSignals(
			{ rpc } as unknown as SupabaseClient,
			'org-1'
		)({
			asOf: '2026-10-23',
			personnelIds: ['a', 'b', 'c']
		});
		expect(rpc).toHaveBeenCalledWith('roster_signal_training', {
			p_organization_id: 'org-1',
			p_personnel_ids: ['a', 'b', 'c']
		});
		expect(
			[...read].map(([id, readiness]) => [
				id,
				readiness.items.map((item) => [item.name, item.status, item.daysUntilExpiration])
			])
		).toEqual([
			['a', [['CPR/BLS', 'expired', -22]]],
			['b', [['CPR/BLS', 'missing', null]]],
			['c', []]
		]);
	});
});
