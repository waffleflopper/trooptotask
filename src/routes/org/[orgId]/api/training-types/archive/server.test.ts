import { describe, expect, it } from 'vitest';
import { createTestContext } from '$features/training/server/trainingPersistence.test-support.server';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import { _putConfig } from './+server';

const CPR = 'e6110000-0000-0000-0000-000000000501';
const FOREIGN = 'e6110000-0000-0000-0000-000000000599';

function context(options?: Parameters<typeof createTestContext>[0]) {
	const ctx = createTestContext(options);
	ctx.store.seed('training_types', [
		{ id: CPR, organization_id: ctx.auth.orgId, name: 'CPR', sort_order: 0, archived_at: null }
	]);
	ctx.store.seed('personnel_trainings', [{ id: 'record-1', organization_id: ctx.auth.orgId, training_type_id: CPR }]);
	return ctx;
}

const put = (ctx: ReturnType<typeof context>, input: Record<string, unknown>) =>
	handleUseCaseRequest(_putConfig, ctx, input, () => ctx);

describe('PUT Training type archive', () => {
	it('archives a type with records, answers the time the server set, and keeps the records', async () => {
		const ctx = context();

		const result = (await put(ctx, { id: CPR, archived: true })) as { archivedAt: string };

		expect(result.archivedAt).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
		expect(await ctx.store.findOne('training_types', ctx.auth.orgId, { id: CPR })).toMatchObject({
			archived_at: result.archivedAt
		});
		expect(await ctx.store.findMany('personnel_trainings', ctx.auth.orgId)).toHaveLength(1);
	});

	it('restores it', async () => {
		const ctx = context();
		await put(ctx, { id: CPR, archived: true });

		expect(await put(ctx, { id: CPR, archived: false })).toMatchObject({ id: CPR, archivedAt: null });
	});

	it('ignores an archive time sent by the client', async () => {
		const ctx = context();

		await expect(put(ctx, { id: CPR, archived: true, archivedAt: '1999-01-01T00:00:00Z' })).rejects.toMatchObject({
			status: 400
		});
		expect(await ctx.store.findOne('training_types', ctx.auth.orgId, { id: CPR })).toMatchObject({
			archived_at: null
		});
	});

	it('answers 404 for a type in another Organization', async () => {
		const ctx = context();
		ctx.store.seed('training_types', [
			{ id: FOREIGN, organization_id: 'another-org', name: 'Foreign', sort_order: 0, archived_at: null }
		]);

		await expect(put(ctx, { id: FOREIGN, archived: true })).rejects.toMatchObject({
			status: 404
		});
		expect(await ctx.store.findOne('training_types', 'another-org', { id: FOREIGN })).toMatchObject({
			archived_at: null
		});
	});

	it('denies a member who can only view Training and archives nothing', async () => {
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

		await expect(put(ctx, { id: CPR, archived: true })).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findOne('training_types', ctx.auth.orgId, { id: CPR })).toMatchObject({
			archived_at: null
		});
	});
});
