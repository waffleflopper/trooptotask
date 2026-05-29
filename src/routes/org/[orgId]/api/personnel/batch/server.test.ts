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
});
