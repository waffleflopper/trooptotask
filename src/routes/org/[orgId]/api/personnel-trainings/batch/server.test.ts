import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('/api/personnel-trainings/batch route config', () => {
	it('defers batch import authorization to Training policy use cases instead of legacy edit flags', async () => {
		let legacyEditCalled = false;
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				isFullEditor: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				requireEdit() {
					legacyEditCalled = true;
					throw new Error('legacy Training edit flag should not decide batch imports');
				}
			}
		});

		ctx.store.seed('personnel', [
			{
				id: 'p-1',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				group_id: null,
				archived_at: null
			}
		]);
		ctx.store.seed('training_types', [
			{
				id: 'tt-1',
				organization_id: ctx.auth.orgId,
				expiration_months: null,
				expiration_date_only: false,
				can_be_exempted: false,
				exempt_personnel_ids: []
			}
		]);

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			records: [{ personnelId: 'p-1', trainingTypeId: 'tt-1', completionDate: '2026-01-01', status: 'completed' }]
		});

		expect(legacyEditCalled).toBe(false);
		expect(result).toMatchObject({ errors: [] });
	});
});
