import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('POST /api/personnel/merge', () => {
	it('declares policy-first authorization for personnel merge', () => {
		expect(_postConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.mergeRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in _postConfig).toBe(false);
		expect('deferPolicyToUseCase' in _postConfig).toBe(false);
	});

	it('returns updated, skipped, ambiguous, and failed rows for the merge workflow', async () => {
		const ctx = createTestContext();
		ctx.store.seed('personnel', [
			{
				id: 'person-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: null,
				deros: null,
				archived_at: null
			},
			{
				id: 'person-2',
				organization_id: ctx.auth.orgId,
				rank: 'SSG',
				last_name: 'Jones',
				first_name: 'Pat',
				mos: '68W',
				clinic_role: 'Medic',
				group_id: null,
				ets: '2027-05-01',
				deros: null,
				archived_at: null
			},
			{
				id: 'person-3',
				organization_id: ctx.auth.orgId,
				rank: 'CPT',
				last_name: 'Taylor',
				first_name: 'Alex',
				mos: '70B',
				clinic_role: 'Commander',
				group_id: null,
				ets: null,
				deros: null,
				archived_at: null
			},
			{
				id: 'person-4',
				organization_id: ctx.auth.orgId,
				rank: 'CPT',
				last_name: 'Taylor',
				first_name: 'Alex',
				mos: '70B',
				clinic_role: 'Commander',
				group_id: null,
				ets: null,
				deros: null,
				archived_at: null
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			records: [
				{ rank: 'SGT', lastName: 'Smith', firstName: 'Jamie', ets: '2027-05-01' },
				{ rank: 'SSG', lastName: 'Jones', firstName: 'Pat', ets: '2027-05-01' },
				{ rank: 'CPT', lastName: 'Taylor', firstName: 'Alex', deros: '2026-11-30' },
				{ rank: 'PFC', lastName: 'Brown', firstName: 'Jordan', ets: '2028-01-01' }
			]
		});

		expect(result.matched).toHaveLength(2);
		expect(result.updated).toEqual([
			expect.objectContaining({
				id: 'person-1',
				ets: '2027-05-01'
			})
		]);
		expect(result.skipped).toEqual([{ index: 1, message: 'Matched personnel already has the requested values' }]);
		expect(result.ambiguous).toEqual([{ index: 2, message: 'Multiple personnel rows matched this record' }]);
		expect(result.errors).toEqual([{ index: 3, message: 'No active personnel row matched this record' }]);
	});
});
