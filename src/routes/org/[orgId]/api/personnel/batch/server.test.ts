import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('POST /api/personnel/batch', () => {
	it('declares policy-first authorization for Personnel import', () => {
		expect(_postConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in _postConfig).toBe(false);
	});

	it('allows Personnel operate access to submit an import batch', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'operate',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan' }]
		});

		expect(result).toMatchObject({
			errors: [],
			inserted: [expect.objectContaining({ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan' })]
		});
	});

	it('returns HTTP-successful per-row errors when the personnel cap is reached', async () => {
		const ctx = createTestContext();
		ctx.subscription.getAvailablePersonnelSlots = async () => 0;

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			records: [{ rank: 'SGT', lastName: 'Smith', firstName: 'Jordan' }]
		});

		expect(result).toMatchObject({
			inserted: [],
			errors: [{ index: 0, message: 'Personnel cap reached — upgrade or archive personnel before adding this record' }],
			capReached: true,
			capError: 'Personnel cap reached — upgrade or archive personnel before adding this record'
		});
	});

	it('accepts structurally valid Personnel batch records', () => {
		const result = _postConfig.input.safeParse({
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jordan',
					mos: '68W',
					clinicRole: null,
					groupName: 'Alpha Team',
					ets: '2027-05-01',
					deros: '2026-11-30'
				}
			]
		});

		expect(result.success).toBe(true);
	});

	it('rejects non-array Personnel batch records', () => {
		const result = _postConfig.input.safeParse({ records: {} });

		expect(result.success).toBe(false);
	});

	it('strips unknown Personnel batch record fields', () => {
		const result = _postConfig.input.safeParse({
			records: [
				{
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jordan',
					isAdmin: true
				}
			]
		});

		expect(result.success).toBe(true);
		if (!result.success) throw new Error('expected valid Personnel batch payload');
		expect(result.data.records[0]).not.toHaveProperty('isAdmin');
	});
});
