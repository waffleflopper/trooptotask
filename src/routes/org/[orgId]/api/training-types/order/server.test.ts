import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _putConfig } from './+server';

const A = 'e6110000-0000-0000-0000-000000000401';
const B = 'e6110000-0000-0000-0000-000000000402';
const C = 'e6110000-0000-0000-0000-000000000403';
const choice = { trainingTypeIds: [C, A, B], expectedTrainingTypeIds: [A, B, C] };

function context(options?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(options);
	ctx.store.seed('training_types', [
		{ id: A, organization_id: ctx.auth.orgId, name: 'A', sort_order: 10 },
		{ id: B, organization_id: ctx.auth.orgId, name: 'B', sort_order: 20 },
		{ id: C, organization_id: ctx.auth.orgId, name: 'C', sort_order: 30 },
		{ id: 'foreign', organization_id: 'another-org', name: 'Foreign', sort_order: 99 }
	]);
	return ctx;
}

const put = (ctx: ReturnType<typeof context>, input: Record<string, unknown>) =>
	handleUseCaseRequest(_putConfig, ctx, input, () => ctx);
const positions = async (ctx: ReturnType<typeof context>) =>
	(await ctx.trainingCatalog.listTypes()).map(({ id, sortOrder }) => [id, sortOrder]);

describe('PUT Training type order', () => {
	it('saves every position from zero in one command and audits the Organization', async () => {
		const ctx = context();
		expect(await put(ctx, choice)).toEqual({ success: true });
		expect(await positions(ctx)).toEqual([
			[C, 0],
			[A, 1],
			[B, 2]
		]);
		expect(await ctx.store.findOne('training_types', 'another-org', { id: 'foreign' })).toMatchObject({
			sort_order: 99
		});
		expect(ctx.auditPort.events).toMatchObject([
			{
				action: 'training_type.reordered',
				resourceType: 'organization',
				resourceId: ctx.auth.orgId,
				details: { trainingTypeIds: [C, A, B] }
			}
		]);
	});

	it.each([
		[A, A, B],
		[A, B],
		[A, B, 'e6110000-0000-0000-0000-000000000499']
	])('rejects a wrong set of IDs with 400', async (...ids) => {
		const ctx = context();
		await expect(put(ctx, { ...choice, trainingTypeIds: ids })).rejects.toMatchObject({ status: 400 });
		expect(await positions(ctx)).toEqual([
			[A, 10],
			[B, 20],
			[C, 30]
		]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it.each([
		[B, A, C],
		[A, B]
	])('rejects a stale expected list with 409', async (...ids) => {
		const ctx = context();
		await expect(put(ctx, { ...choice, expectedTrainingTypeIds: ids })).rejects.toMatchObject({ status: 409 });
		expect(await positions(ctx)).toEqual([
			[A, 10],
			[B, 20],
			[C, 30]
		]);
		expect(ctx.auditPort.events).toEqual([]);
	});

	it.each(['viewer', 'scoped'] as const)('denies a %s actor with 403 without changing order', async (actor) => {
		const ctx = context({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: actor === 'viewer' ? 'view' : 'configure',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				...(actor === 'scoped' ? { scopeSet: { kind: 'groups' as const, groupIds: ['group-1'] } } : {})
			}
		});
		await expect(put(ctx, choice)).rejects.toMatchObject({ status: 403 });
		expect(await positions(ctx)).toEqual([
			[A, 10],
			[B, 20],
			[C, 30]
		]);
		expect(ctx.auditPort.events.filter(({ action }) => action === 'training_type.reordered')).toEqual([]);
	});
});
