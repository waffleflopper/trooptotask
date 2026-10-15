import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _deleteConfig } from './+server';

describe('DELETE /api/personnel/permanent', () => {
	it('declares policy-first authorization for permanent Personnel deletion', () => {
		expect(_deleteConfig).toMatchObject({
			mutation: true,
			policyAction: POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
			policyResource: { kind: 'unscoped' }
		});
		expect('permission' in _deleteConfig).toBe(false);
	});

	it('uses Personnel policy decisions instead of route-level privileged authorization', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'configure',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		const selected = { ...ctx, notifyPersonnelDeleted: vi.fn(async (_name: string) => {}) };
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);

		const result = await handleUseCaseRequest(
			_deleteConfig,
			ctx,
			{ id: '11111111-1111-4111-8111-111111111111' },
			() => selected
		);

		expect(result).toEqual({ success: true });
		expect(selected.notifyPersonnelDeleted).toHaveBeenCalledWith('SGT Smith, Jamie');
		expect(await ctx.store.findMany('personnel', ctx.auth.orgId)).toEqual([]);
	});

	it('rejects a malformed Personnel id with 400 and deletes nothing', async () => {
		const ctx = createTestContext({ auth: { role: 'admin', isPrivileged: true } });
		const selected = { ...ctx, notifyPersonnelDeleted: vi.fn(async (_name: string) => {}) };
		ctx.store.seed('personnel', [
			{
				id: '11111111-1111-4111-8111-111111111111',
				organization_id: ctx.auth.orgId,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jamie',
				archived_at: '2026-04-01T00:00:00Z'
			}
		]);

		await expect(handleUseCaseRequest(_deleteConfig, ctx, { id: 'person' }, () => selected)).rejects.toMatchObject({
			status: 400,
			message: 'Invalid ID'
		});
		await expect(handleUseCaseRequest(_deleteConfig, ctx, {}, () => selected)).rejects.toMatchObject({
			status: 400,
			message: 'Missing id'
		});
		expect(selected.notifyPersonnelDeleted).not.toHaveBeenCalled();
		expect(await ctx.store.findMany('personnel', ctx.auth.orgId)).toHaveLength(1);
	});
});
