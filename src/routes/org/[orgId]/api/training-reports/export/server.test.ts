import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

describe('GET /api/training-reports/export', () => {
	it('uses training read permission and returns CSV download output', async () => {
		const ctx = createTestContext();

		ctx.store.seed('personnel', [
			{
				id: 'p-smith',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: 'group-1',
				archived_at: null,
				groups: { name: 'Alpha' }
			}
		]);
		ctx.store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ctx.auth.orgId,
				name: 'CPR',
				description: null,
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: [],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: [],
				is_optional: false
			}
		]);

		expect(_getConfig.permission).toBe('training');

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			sortColumn: 'name',
			sortDirection: 'asc'
		});
		const response = _getConfig.formatOutput?.(result);

		expect(result).toContain('Name,Rank,MOS,Role,Group,CPR');
		expect(result).toContain('"Smith, Jane"');
		expect(response?.headers.get('Content-Type')).toBe('text/csv;charset=utf-8');
		expect(response?.headers.get('Content-Disposition')).toMatch(/attachment; filename="training-report-/);
		expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response?.headers.get('Vary')).toBe('Cookie');
	});
});
