import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _postConfig, _putConfig } from './+server';

describe('/api/onboarding route config', () => {
	it('uses policy-first route configs for onboarding lifecycle mutations', () => {
		for (const config of [_postConfig, _putConfig]) {
			expect('permission' in config).toBe(false);
			expect('deferPolicyToUseCase' in config).toBe(false);
			expect(config.policyAction).toBe(POLICY_ACTION_CATALOG.onboarding.manageWorkflows);
			expect(config.policyResource).toEqual({ kind: 'unscoped' });
		}
	});

	it('starts onboarding after the route-level policy decision allows the request', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'operate',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
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

		const result = await handleUseCaseRequest(_postConfig, ctx, {
			personnelId: 'p-1',
			templateId: 'template-1'
		});

		expect(result).toMatchObject({ personnelId: 'p-1', templateId: 'template-1', status: 'in_progress' });
	});

	it('denies onboarding lifecycle mutations before use-case execution when policy is missing', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'view',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				personnelId: 'p-1',
				templateId: 'template-1'
			})
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'onboarding.manageWorkflows'
			})
		]);
	});
});
