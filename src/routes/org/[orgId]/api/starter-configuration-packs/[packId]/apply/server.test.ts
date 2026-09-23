import { describe, expect, it, vi } from 'vitest';
import type { CapabilityMap } from '$lib/access/memberAccessShape';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig } from './+server';

const NO_TRAINING_CONFIGURE: CapabilityMap = {
	calendar: 'configure',
	personnel: 'none',
	training: 'operate',
	criticalTasks: 'none',
	onboarding: 'configure',
	ratingScheme: 'none'
};

const NO_ONBOARDING_CONFIGURE: CapabilityMap = {
	calendar: 'none',
	personnel: 'none',
	training: 'configure',
	criticalTasks: 'none',
	onboarding: 'operate',
	ratingScheme: 'none'
};

describe('POST /api/starter-configuration-packs/[packId]/apply', () => {
	it('uses a policy-first mutation route config', () => {
		expect('permission' in _postConfig).toBe(false);
		expect(_postConfig.mutation).toBe(true);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.configureRequirements);
		expect(_postConfig.policyResource).toEqual({ kind: 'organization' });
	});

	it('uses the route pack id as the apply input', async () => {
		const input = await _postConfig.parseInput?.({
			params: { packId: 'first-week-operations' }
		} as Parameters<NonNullable<typeof _postConfig.parseInput>>[0]);

		expect(input).toEqual({ packId: 'first-week-operations' });
	});

	it('applies the starter pack through the route config', async () => {
		const ctx = createTestContext();

		const result = await handleUseCaseRequest(_postConfig, ctx, { packId: 'first-week-operations' });

		expect(result.failed).toEqual([]);
		expect(result.created).toContainEqual({ family: 'training-types', name: 'Unit Orientation' });
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toHaveLength(2);
		expect(await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId)).toHaveLength(4);
	});

	it('allows Training and onboarding configurators without Calendar access', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...NO_ONBOARDING_CONFIGURE, onboarding: 'configure' }
			}
		});

		const result = await handleUseCaseRequest(_postConfig, ctx, { packId: 'first-week-operations' });

		expect(result.failed).toEqual([]);
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toHaveLength(2);
		expect(await ctx.store.findMany('onboarding_template_steps', ctx.auth.orgId)).toHaveLength(4);
		expect(await ctx.store.findMany('assignment_types', ctx.auth.orgId)).toEqual([]);
	});

	it('denies at the route policy before mutation when Training configure is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_TRAINING_CONFIGURE
			}
		});
		const insertSpy = vi.spyOn(ctx.store, 'insert');

		await expect(handleUseCaseRequest(_postConfig, ctx, { packId: 'first-week-operations' })).rejects.toMatchObject({
			status: 403
		});

		expect(insertSpy).not.toHaveBeenCalled();
	});

	it('denies from the starter-pack preflight before writes when another configure action is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: NO_ONBOARDING_CONFIGURE
			}
		});
		const insertSpy = vi.spyOn(ctx.store, 'insert');

		await expect(handleUseCaseRequest(_postConfig, ctx, { packId: 'first-week-operations' })).rejects.toMatchObject({
			status: 403
		});

		expect(insertSpy).not.toHaveBeenCalled();
	});
});
