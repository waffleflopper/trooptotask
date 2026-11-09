import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _getConfig } from './+server';

const USED = 'e6110000-0000-0000-0000-000000000601';
const UNUSED = 'e6110000-0000-0000-0000-000000000602';

function context(options?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(options);
	ctx.store.seed('training_types', [
		{ id: USED, organization_id: ctx.auth.orgId, name: 'CPR', sort_order: 0 },
		{ id: UNUSED, organization_id: ctx.auth.orgId, name: 'SHARP', sort_order: 1 },
		{ id: 'foreign', organization_id: 'another-org', name: 'Foreign', sort_order: 0 }
	]);
	ctx.store.seed('personnel_trainings', [
		{ id: 'r-1', organization_id: ctx.auth.orgId, training_type_id: USED },
		{ id: 'r-2', organization_id: ctx.auth.orgId, training_type_id: USED },
		{ id: 'r-3', organization_id: 'another-org', training_type_id: UNUSED }
	]);
	return ctx;
}

const get = (ctx: ReturnType<typeof context>) => handleUseCaseRequest(_getConfig, ctx, undefined, () => ctx);

describe('GET Training type usage', () => {
	it('counts this Organization records per type and lists unused types as zero', async () => {
		expect(await get(context())).toEqual({ [USED]: 2, [UNUSED]: 0 });
	});

	it('denies a member who can only view Training', async () => {
		const ctx = context({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'view',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});

		await expect(get(ctx)).rejects.toMatchObject({ status: 403 });
	});
});
