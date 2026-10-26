import { describe, expect, it, vi } from 'vitest';
import { createWritePortsContext } from '$features/training/server/trainingPersistence.test-support.server';
import {
	createTrainingType,
	updateTrainingType,
	deleteTrainingType,
	createTrainingView,
	updateTrainingView,
	deleteTrainingView
} from './trainingCatalogOperations.server';
import { trainingTypeDraftFrom, trainingTypeInputFromDraft } from '../utils/trainingTypeDraft';
import { trainingTypeCreateInput, trainingTypeUpdateInput } from './trainingPersistenceMapping.server';

const TARGETED_TYPE = '00000000-0000-4000-8000-00000000c001';
const REQUIRED_TYPE = '00000000-0000-4000-8000-00000000c002';

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
	describe('warning order', () => {
		it.each([
			{ warningDaysYellow: 30, warningDaysOrange: 30 },
			{ warningDaysYellow: 30, warningDaysOrange: 31 },
			{ warningDaysYellow: 30 },
			{ warningDaysOrange: 60 }
		])('rejects an invalid create including defaulted counterparts %j', async (warnings) => {
			const ctx = createWritePortsContext();
			await expect(createTrainingType(ctx, { name: 'Invalid', ...warnings })).rejects.toMatchObject({ status: 400 });
			expect(await ctx.trainingCatalog.listTypes()).toEqual([]);
		});

		it.each([
			{ warnings: { warningDaysYellow: 31 }, yellow: 31, orange: 30 },
			{ warnings: { warningDaysOrange: 59 }, yellow: 60, orange: 59 },
			{ warnings: { warningDaysYellow: 1, warningDaysOrange: 0 }, yellow: 1, orange: 0 }
		])('creates a valid pair with %j', async ({ warnings, yellow, orange }) => {
			const ctx = createWritePortsContext();
			const created = await createTrainingType(ctx, { name: 'Valid', ...warnings });
			expect(await ctx.trainingCatalog.listTypes()).toMatchObject([
				{ id: created.id, warningDaysYellow: yellow, warningDaysOrange: orange }
			]);
		});

		it.each([
			{ warningDaysOrange: 60 },
			{ warningDaysOrange: 61 },
			{ warningDaysYellow: 30 },
			{ warningDaysYellow: 29 },
			{ warningDaysYellow: 15, warningDaysOrange: 15 }
		])('rejects an invalid update against the saved counterpart %j', async (warnings) => {
			const ctx = createWritePortsContext();
			const created = await createTrainingType(ctx, { name: 'CLS' });
			await expect(updateTrainingType(ctx, { id: created.id, ...warnings })).rejects.toMatchObject({ status: 400 });
			expect(await ctx.trainingCatalog.listTypes()).toMatchObject([
				{ id: created.id, warningDaysYellow: 60, warningDaysOrange: 30 }
			]);
			expect(ctx.audit.events.map((event) => event.action)).toEqual(['training_type.created']);
		});

		it.each([
			{ warnings: { warningDaysOrange: 59 }, yellow: 60, orange: 59 },
			{ warnings: { warningDaysYellow: 31 }, yellow: 31, orange: 30 },
			{ warnings: { warningDaysYellow: 10, warningDaysOrange: 5 }, yellow: 10, orange: 5 }
		])('saves a valid warning update %j', async ({ warnings, yellow, orange }) => {
			const ctx = createWritePortsContext();
			const created = await createTrainingType(ctx, { name: 'CLS' });
			await updateTrainingType(ctx, { id: created.id, ...warnings });
			expect(await ctx.trainingCatalog.listTypes()).toMatchObject([
				{ id: created.id, warningDaysYellow: yellow, warningDaysOrange: orange }
			]);
		});

		it('keeps a legacy invalid type readable and permits edits that send neither warning', async () => {
			const ctx = createWritePortsContext();
			ctx.store.seed('training_types', [
				{
					id: REQUIRED_TYPE,
					organization_id: ctx.auth.orgId,
					name: 'Legacy',
					warning_days_yellow: 10,
					warning_days_orange: 20
				}
			]);
			expect(await ctx.trainingCatalog.listTypes()).toMatchObject([
				{ id: REQUIRED_TYPE, warningDaysYellow: 10, warningDaysOrange: 20 }
			]);
			await updateTrainingType(ctx, { id: REQUIRED_TYPE, sortOrder: 4 });
			expect(await ctx.trainingCatalog.listTypes()).toMatchObject([
				{ id: REQUIRED_TYPE, sortOrder: 4, warningDaysYellow: 10, warningDaysOrange: 20 }
			]);
			await expect(updateTrainingType(ctx, { id: REQUIRED_TYPE, warningDaysYellow: 15 })).rejects.toMatchObject({
				status: 400
			});
			await updateTrainingType(ctx, { id: REQUIRED_TYPE, warningDaysOrange: 5 });
			expect(await ctx.trainingCatalog.listTypes()).toMatchObject([
				{ id: REQUIRED_TYPE, warningDaysYellow: 10, warningDaysOrange: 5 }
			]);
		});

		it('renames a legacy never type through its draft without rewriting hidden warnings', async () => {
			const ctx = createWritePortsContext();
			await ctx.trainingCatalog.createType({
				name: 'Legacy never',
				expirationMonths: null,
				expirationDateOnly: false,
				warningDaysYellow: 10,
				warningDaysOrange: 20
			});
			const [saved] = await ctx.trainingCatalog.listTypes();
			const draft = trainingTypeDraftFrom(saved);
			draft.name = 'Renamed never';
			await updateTrainingType(ctx, { id: saved.id, ...trainingTypeInputFromDraft(draft, 'update') });
			expect(await ctx.trainingCatalog.listTypes()).toMatchObject([
				{ id: saved.id, name: 'Renamed never', expirationMonths: null, warningDaysYellow: 10, warningDaysOrange: 20 }
			]);
		});

		it('does not use another Organization warning values for a partial update', async () => {
			const ctx = createWritePortsContext();
			ctx.store.seed('training_types', [
				{
					id: REQUIRED_TYPE,
					organization_id: 'other-org',
					name: 'Foreign',
					warning_days_yellow: 60,
					warning_days_orange: 30
				}
			]);
			await expect(updateTrainingType(ctx, { id: REQUIRED_TYPE, warningDaysOrange: 20 })).rejects.toMatchObject({
				status: 404
			});
		});

		it('requires configuration capability before reading a saved warning counterpart', async () => {
			const ctx = createWritePortsContext({ auth: NO_CONFIGURE });
			await expect(updateTrainingType(ctx, { id: REQUIRED_TYPE, warningDaysOrange: 20 })).rejects.toMatchObject({
				status: 403
			});
		});

		it('associates warning-order input errors with the final warning field', () => {
			for (const schema of [trainingTypeCreateInput, trainingTypeUpdateInput]) {
				const result = schema.safeParse({
					id: REQUIRED_TYPE,
					name: 'CLS',
					warningDaysYellow: 30,
					warningDaysOrange: 30
				});
				expect(result.error?.issues.map((issue) => ({ code: issue.code, path: issue.path }))).toEqual([
					{ code: 'custom', path: ['warningDaysOrange'] }
				]);
			}
		});
	});

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
		const created = await createTrainingView(ctx, { name: 'Focus', columnIds: [TARGETED_TYPE, REQUIRED_TYPE] });
		const updated = await updateTrainingView(ctx, {
			id: created.id,
			name: 'Focus Renamed',
			columnIds: [REQUIRED_TYPE, TARGETED_TYPE]
		});
		expect(updated).toMatchObject({ id: created.id, name: 'Focus Renamed', columnIds: [REQUIRED_TYPE, TARGETED_TYPE] });
		await deleteTrainingView(ctx, created.id);
		expect(await ctx.store.findOne('training_views', ctx.auth.orgId, { id: created.id })).toBeNull();
		expect(ctx.audit.events.map((event) => event.action)).toEqual([
			'training_view.created',
			'training_view.updated',
			'training_view.deleted'
		]);
	});
});
