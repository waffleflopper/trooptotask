import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

describe('/api/personnel-trainings route config', () => {
	it('defers mutation authorization to Training policy use cases instead of legacy edit flags', async () => {
		let legacyEditCalled = false;
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
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
					throw new Error('legacy Training edit flag should not decide record writes');
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
				expiration_date_only: false
			}
		]);

		await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'p-1',
			trainingTypeId: 'tt-1',
			completionDate: '2026-01-01',
			notes: null,
			certificateUrl: null
		});

		expect(legacyEditCalled).toBe(false);
		const stored = await ctx.store.findMany('personnel_trainings', ctx.auth.orgId);
		expect(stored).toHaveLength(1);
	});
});
