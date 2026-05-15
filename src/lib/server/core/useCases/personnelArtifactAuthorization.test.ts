import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { listPersonnelCounselingRecords } from './personnelCounselingRecords';
import { listPersonnelDocuments } from './personnelDocuments';
import { listPersonnelFollowUps } from './personnelFollowUps';
import { listPersonnelLeaderNotes } from './personnelLeaderNotes';

function operateContext() {
	const ctx = createTestContext({
		auth: {
			capabilityMap: {
				calendar: 'view',
				personnel: 'operate',
				training: 'view',
				criticalTasks: 'view',
				onboarding: 'view',
				ratingScheme: 'view'
			},
			scopeSet: { kind: 'organization' },
			requireGroupAccess: vi.fn(async () => {})
		}
	});
	ctx.store.seed('personnel', [{ id: 'person-1', organization_id: ctx.auth.orgId, group_id: null }]);
	return ctx;
}

describe('personnel artifact authorization', () => {
	it('caches the shared Personnel access check across dashboard artifact loaders', async () => {
		const ctx = operateContext();
		const findOne = ctx.rawStore.findOne.bind(ctx.rawStore);
		const findOneSpy = vi.fn(findOne);
		ctx.rawStore.findOne = findOneSpy;

		await Promise.all([
			listPersonnelCounselingRecords(ctx, 'person-1', 5),
			listPersonnelDocuments(ctx, 'person-1', 5),
			listPersonnelFollowUps(ctx, 'person-1'),
			listPersonnelLeaderNotes(ctx, 'person-1', 1)
		]);

		expect(findOneSpy.mock.calls.filter(([table]) => table === 'personnel')).toHaveLength(1);
		expect(ctx.auth.requireGroupAccess).toHaveBeenCalledTimes(1);
	});

	it('keeps group-scope rejection inside the shared service-layer helper', async () => {
		const ctx = operateContext();
		(ctx.auth as typeof ctx.auth & { requireGroupAccess: typeof ctx.auth.requireGroupAccess }).requireGroupAccess =
			vi.fn(async () => {
				const error = new Error('Group access denied') as Error & { status?: number };
				error.status = 403;
				throw error;
			});

		await expect(listPersonnelDocuments(ctx, 'person-1', 5)).rejects.toMatchObject({ status: 403 });
	});
});
