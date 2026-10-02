import { describe, expect, it, vi } from 'vitest';
import { createWritePortsContext } from '$lib/server/adapters/inMemory';
import {
	createTrainingType,
	updateTrainingType,
	deleteTrainingType,
	createTrainingView,
	updateTrainingView,
	deleteTrainingView
} from './trainingCatalogOperations.server';

const NO_CONFIGURE = {
	role: 'member' as const,
	isPrivileged: false,
	capabilityMap: {
		calendar: 'none' as const,
		personnel: 'none' as const,
		training: 'operate' as const,
		criticalTasks: 'none' as const,
		onboarding: 'none' as const,
		ratingScheme: 'none' as const
	}
};

describe('Training catalog operations', () => {
	it('creates a type with the saved defaults, clears its description, then deletes and notifies admins', async () => {
		const ctx = {
			...createWritePortsContext(),
			notifyTrainingTypeDeleted: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
		};
		const created = await createTrainingType(ctx, { name: 'First Aid', description: 'Initial description' });
		expect(created).toMatchObject({
			name: 'First Aid',
			description: 'Initial description',
			expirationMonths: null,
			appliesToRoles: [],
			isOptional: false
		});
		const updated = await updateTrainingType(ctx, { id: created.id, description: null });
		expect(updated.description).toBeNull();
		const saved = await ctx.store.findOne<{ description: string | null }>('training_types', ctx.auth.orgId, {
			id: created.id
		});
		expect(saved?.description).toBeNull();

		await deleteTrainingType(ctx, created.id);
		expect(await ctx.store.findOne('training_types', ctx.auth.orgId, { id: created.id })).toBeNull();
		expect(ctx.notifyTrainingTypeDeleted).toHaveBeenCalledOnce();
		expect(ctx.audit.events.map((event) => event.action)).toEqual([
			'training_type.created',
			'training_type.updated',
			'training_type.deleted'
		]);
	});

	it('keeps completions and skips deletion side effects when the type delete is rejected', async () => {
		const ctx = {
			...createWritePortsContext(),
			notifyTrainingTypeDeleted: vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
		};
		const created = await createTrainingType(ctx, { name: 'Protected type' });
		ctx.store.seed('personnel_trainings', [
			{ id: 'record-1', organization_id: ctx.auth.orgId, training_type_id: created.id }
		]);
		vi.spyOn(ctx.store, 'delete').mockRejectedValueOnce(new Error('referenced by another Organization'));

		await expect(deleteTrainingType(ctx, created.id)).rejects.toThrow('referenced by another Organization');
		expect(await ctx.store.findOne('training_types', ctx.auth.orgId, { id: created.id })).not.toBeNull();
		expect(await ctx.store.findOne('personnel_trainings', ctx.auth.orgId, { id: 'record-1' })).not.toBeNull();
		expect(ctx.audit.events.map((event) => event.action)).toEqual(['training_type.created']);
		expect(ctx.notifyTrainingTypeDeleted).not.toHaveBeenCalled();
	});

	it('denies both catalog writes without configuration capability', async () => {
		const ctx = createWritePortsContext({ auth: NO_CONFIGURE });
		await expect(createTrainingType(ctx, { name: 'Denied' })).rejects.toMatchObject({ status: 403 });
		await expect(createTrainingView(ctx, { name: 'Denied' })).rejects.toMatchObject({ status: 403 });
		expect(await ctx.store.findMany('training_types', ctx.auth.orgId)).toEqual([]);
		expect(await ctx.store.findMany('training_views', ctx.auth.orgId)).toEqual([]);
		expect(ctx.audit.events.filter((event) => event.action === 'policy.denied')).toHaveLength(2);
	});

	it('saves ordered view columns and keeps its ID on edit', async () => {
		const ctx = createWritePortsContext();
		const created = await createTrainingView(ctx, { name: 'Focus', columnIds: ['targeted', 'required'] });
		const updated = await updateTrainingView(ctx, {
			id: created.id,
			name: 'Focus Renamed',
			columnIds: ['required', 'targeted']
		});
		expect(updated).toMatchObject({ id: created.id, name: 'Focus Renamed', columnIds: ['required', 'targeted'] });
		await deleteTrainingView(ctx, created.id);
		expect(await ctx.store.findOne('training_views', ctx.auth.orgId, { id: created.id })).toBeNull();
		expect(ctx.audit.events.map((event) => event.action)).toEqual([
			'training_view.created',
			'training_view.updated',
			'training_view.deleted'
		]);
	});
});
