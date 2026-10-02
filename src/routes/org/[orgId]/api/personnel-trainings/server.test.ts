import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig, _postConfig } from './+server';

describe('/api/personnel-trainings route config', () => {
	it.each(['operate', 'configure'] as const)('retains the %s deletion response and target effect', async (training) => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training,
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		const id = '11111111-1111-4111-8111-111111111111';
		ctx.store.seed('personnel', [{ id: 'p-1', organization_id: ctx.auth.orgId, group_id: null }]);
		const record = {
			id,
			organization_id: ctx.auth.orgId,
			personnel_id: 'p-1',
			training_type_id: 'tt-1',
			completion_date: '2026-01-01'
		};
		ctx.store.seed('personnel_trainings', [record]);

		const result = await handleUseCaseRequest(_deleteConfig, ctx, { id });
		const response = _deleteConfig.formatOutput!(result);
		expect(response.status).toBe(training === 'operate' ? 202 : 200);
		expect(await response.json()).toEqual(training === 'operate' ? { requiresApproval: true } : { success: true });
		expect(await ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).toEqual(
			training === 'operate' ? [record] : []
		);
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
