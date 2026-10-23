import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseCriticalTaskRosterSignals } from './criticalTaskRosterSignals.server';

const TASK = {
	id: 'airway',
	task_code: 'A-001',
	title: 'Airway',
	description: null,
	category: null,
	mos: ['68W'],
	expiration_months: 12,
	sort_order: 0,
	archived_at: null,
	created_at: '2026-01-01T00:00:00+00:00'
};

describe('createSupabaseCriticalTaskRosterSignals', () => {
	it('builds each cohort member applicable tasks from the newest validation and the unit settings', async () => {
		const rpc = vi.fn(async () => ({
			data: {
				cohort: [
					['a', '68W'],
					['b', '68W'],
					['c', '11B']
				],
				tasks: [TASK],
				settings: { defaultExpirationMonths: 12, expiringSoonWarningDays: 30 },
				completions: [['a', 'airway', '2025-10-25', '2025-10-25T08:00:00+00:00', 'SFC Lead']]
			},
			error: null
		}));
		const read = await createSupabaseCriticalTaskRosterSignals(
			{ rpc } as unknown as SupabaseClient,
			'org-1'
		)({
			asOf: '2026-10-23',
			personnelIds: null
		});
		expect(rpc).toHaveBeenCalledWith('roster_signal_critical_tasks', {
			p_organization_id: 'org-1',
			p_personnel_ids: null
		});
		expect(
			[...read].map(([id, readiness]) => [
				id,
				readiness.items.map((item) => [item.name, item.status, item.daysUntilExpiration])
			])
		).toEqual([
			['a', [['Airway', 'expiring', 2]]],
			['b', [['Airway', 'missing', null]]],
			['c', []]
		]);
	});
});
