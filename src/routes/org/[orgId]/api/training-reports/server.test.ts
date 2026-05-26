import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

describe('GET /api/training-reports', () => {
	it('exports a training read RouteConfig', () => {
		expect('permission' in _getConfig).toBe(false);
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.viewRecords);
		expect(_getConfig.policyResource).toEqual({ kind: 'unscoped' });
		expect(_getConfig.mutation).toBeUndefined();
	});

	it('denies training report access through the policy decision', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			handleUseCaseRequest(_getConfig, ctx, {
				page: 1,
				pageSize: 25,
				sortColumn: 'name',
				sortDirection: 'asc'
			})
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training.viewRecords'
			})
		]);
	});

	it('returns a server-computed paginated training report page', async () => {
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

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			page: 1,
			pageSize: 25,
			sortColumn: 'name',
			sortDirection: 'asc'
		});

		expect(result.detail.totalRows).toBe(1);
		expect(result.detail.rows[0].person.id).toBe('p-smith');
		expect(result.trainingTypes).toEqual([expect.objectContaining({ id: 'type-cpr', name: 'CPR' })]);
	});

	it('returns only display metadata for report training types', async () => {
		const ctx = createTestContext();

		ctx.store.seed('training_types', [
			{
				id: 'type-cpr',
				organization_id: ctx.auth.orgId,
				name: 'CPR',
				description: 'Internal details',
				expiration_months: null,
				warning_days_yellow: 60,
				warning_days_orange: 30,
				applies_to_roles: ['Medic'],
				applies_to_mos: [],
				applies_to_ranks: [],
				excluded_roles: [],
				excluded_mos: [],
				excluded_ranks: [],
				color: '#22c55e',
				sort_order: 0,
				expiration_date_only: false,
				can_be_exempted: true,
				exempt_personnel_ids: ['p-sensitive'],
				is_optional: false
			}
		]);

		const result = await handleUseCaseRequest(_getConfig, ctx, {
			page: 1,
			pageSize: 25,
			sortColumn: 'name',
			sortDirection: 'asc'
		});

		expect(result.trainingTypes).toEqual([{ id: 'type-cpr', name: 'CPR', color: '#22c55e' }]);
	});

	it('marks report responses private and non-cacheable', async () => {
		const response = _getConfig.formatOutput?.({
			dashboard: {
				readinessPercent: 0,
				statusCounts: { current: 0, warningYellow: 0, warningOrange: 0, expired: 0, notCompleted: 0 },
				worstTypes: [],
				groupComparison: [],
				typeBreakdown: []
			},
			detail: {
				rows: [],
				totalRows: 0,
				page: 1,
				pageSize: 25,
				totalPages: 1,
				sort: { column: 'name', direction: 'asc' }
			},
			trainingTypes: [],
			filterOptions: { groups: [], mos: [], roles: [], ranks: [] }
		});

		expect(response?.headers.get('Cache-Control')).toBe('private, no-store');
		expect(response?.headers.get('Vary')).toBe('Cookie');
	});
});
