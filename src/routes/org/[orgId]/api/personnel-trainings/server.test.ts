import { describe, expect, it } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig, _putConfig } from './+server';

describe('/api/personnel-trainings route config', () => {
	it('uses policy-first route configs for all personnel training mutations', () => {
		for (const config of [_postConfig, _putConfig, _deleteConfig]) {
			expect('permission' in config).toBe(false);
			expect(config.policyAction).toBe(POLICY_ACTION_CATALOG.training.recordCompletions);
			expect(config.policyResource).toEqual({ kind: 'unscoped' });
		}
	});

	it('authorizes Training record writes through policy decisions before use-case scoped checks', async () => {
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

	it('denies personnel training writes before executing the use case when Training policy is missing', async () => {
		const ctx = createTestContext({
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
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				personnelId: 'p-1',
				trainingTypeId: 'tt-1',
				completionDate: '2026-01-01',
				notes: null,
				certificateUrl: null
			})
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training.recordCompletions'
			})
		]);
	});
});
