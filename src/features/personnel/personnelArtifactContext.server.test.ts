import { groupCoverageForTest } from '$lib/access/test-support/groupCoverage';
import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { testPersonnelArtifactsContext } from './personnelArtifacts.testHelper';
import { listPersonnelCounselingRecords } from './personnelCounselingRecords.server';
import { listPersonnelDocuments } from './personnelDocuments.server';
import { createPersonnelFollowUp, listPersonnelFollowUps } from './personnelFollowUps.server';

const lists = [listPersonnelCounselingRecords, listPersonnelDocuments, listPersonnelFollowUps];

function seedPeople(ctx: ReturnType<typeof createTestContext>) {
	ctx.store.seed('personnel', [
		{ id: 'alpha', organization_id: ctx.auth.orgId, group_id: 'group-a' },
		{ id: 'bravo', organization_id: ctx.auth.orgId, group_id: 'group-b' }
	]);
}

describe('Personnel artifact request admission', () => {
	it('shares one admitted parent read across concurrent Dashboard artifact streams', async () => {
		const ctx = createTestContext();
		seedPeople(ctx);
		const parentRead = vi.spyOn(ctx.rawStore, 'findOne');
		const context = testPersonnelArtifactsContext(ctx);
		await expect(Promise.all(lists.map((list) => list(context, 'alpha')))).resolves.toEqual([[], [], []]);
		expect(parentRead.mock.calls.filter(([table]) => table === 'personnel')).toHaveLength(1);
	});

	it('caches Group rejection without reading any of the three sensitive tables', async () => {
		const ctx = createTestContext();
		seedPeople(ctx);
		ctx.scope.requireGroupAccess = async () => {
			throw Object.assign(new Error('Group access denied'), { status: 403 });
		};
		const parentRead = vi.spyOn(ctx.rawStore, 'findOne');
		const artifactRead = vi.spyOn(ctx.store, 'findMany');
		const context = testPersonnelArtifactsContext(ctx);
		const results = await Promise.allSettled(lists.map((list) => list(context, 'alpha')));
		for (const result of results) expect(result).toMatchObject({ status: 'rejected', reason: { status: 403 } });
		await expect(listPersonnelDocuments(context, 'alpha')).rejects.toMatchObject({ status: 403 });
		expect(parentRead.mock.calls.filter(([table]) => table === 'personnel')).toHaveLength(1);
		expect(artifactRead).not.toHaveBeenCalled();
		expect(ctx.auditPort.events).toEqual([]);
	});

	it('keeps denied sensitive reads independent from an allowed scoped operate write', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'operate',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a'] })
			}
		});
		seedPeople(ctx);
		const context = testPersonnelArtifactsContext(ctx);
		for (const list of lists) await expect(list(context, 'alpha')).rejects.toMatchObject({ status: 403 });
		const created = await createPersonnelFollowUp(context, { personnelId: 'alpha', title: 'Call the Soldier' });
		expect(created).toMatchObject({ personnelId: 'alpha', title: 'Call the Soldier', status: 'open' });
		await expect(
			createPersonnelFollowUp(context, { personnelId: 'bravo', title: 'Denied call' })
		).rejects.toMatchObject({ status: 403 });
		expect(await ctx.rawStore.findMany('personnel_follow_ups', ctx.auth.orgId)).toEqual([
			expect.objectContaining({ personnel_id: 'alpha', title: 'Call the Soldier' })
		]);
	});

	it('does not reuse an admitted Person grant for another Person or request actor', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: groupCoverageForTest({ kind: 'groups', groupIds: ['group-a'] })
			}
		});
		seedPeople(ctx);
		const context = testPersonnelArtifactsContext(ctx);
		await expect(listPersonnelDocuments(context, 'alpha')).resolves.toEqual([]);
		await expect(listPersonnelDocuments(context, 'bravo')).rejects.toMatchObject({ status: 403 });
		const viewer = {
			...ctx,
			auth: { ...ctx.auth, capabilityMap: { ...ctx.auth.capabilityMap, personnel: 'view' as const } }
		};
		await expect(listPersonnelDocuments(testPersonnelArtifactsContext(viewer), 'alpha')).rejects.toMatchObject({
			status: 403
		});
	});

	it('does not reuse admission across Organizations with the same Person identifier', async () => {
		const first = createTestContext({ auth: { orgId: 'org-a' } });
		const second = createTestContext({
			auth: {
				orgId: 'org-b',
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPeople(first);
		seedPeople(second);
		await expect(listPersonnelDocuments(testPersonnelArtifactsContext(first), 'alpha')).resolves.toEqual([]);
		await expect(listPersonnelDocuments(testPersonnelArtifactsContext(second), 'alpha')).rejects.toMatchObject({
			status: 403
		});
	});

	it.each(lists)('returns the retained parent 404 before reading absent-Person artifacts', async (list) => {
		const ctx = createTestContext();
		const read = vi.spyOn(ctx.store, 'findMany');
		await expect(list(testPersonnelArtifactsContext(ctx), 'missing')).rejects.toMatchObject({
			status: 404,
			message: 'Personnel record not found'
		});
		expect(read).not.toHaveBeenCalled();
	});
});
